import { SessionSchema, authPaths, type Session, type Unsubscribe } from '@meridian/contracts';
import { deepFreeze } from './freeze';
import { notifyAll } from './listeners';

export type SessionPhase = 'active' | 'expiring' | 'expired' | 'signed-out';

export interface SessionState {
  readonly phase: SessionPhase;
  readonly session: Session;
  /** Milliseconds until the session ends, refreshed every second while expiring. */
  readonly remainingMs: number;
  /**
   * Which deadline is next: `idle` can be extended by activity; `absolute` (the
   * maximum session length) cannot - only a new sign-in resets it.
   */
  readonly limit: 'idle' | 'absolute';
}

export interface SessionManager {
  getState(): SessionState;
  subscribe(listener: (state: SessionState) => void): Unsubscribe;
  /** Extends the idle timeout (user clicked "Stay signed in" or was active). */
  keepAlive(): Promise<void>;
  /** Adopts a session document obtained elsewhere (e.g. a re-authentication). */
  apply(session: Session): void;
  /** Mock IdP only: asks the BFF to let the idle timeout lapse shortly (demo of the expiry UX). */
  simulateExpiry(): Promise<void>;
  signOut(): Promise<void>;
  /** A request returned 401: the server no longer recognises the session. */
  handleUnauthorized(): void;
  /** Builds the sign-in URL that returns the user to where they were. */
  loginUrl(returnTo?: string): string;
  dispose(): void;
}

export interface SessionManagerOptions {
  readonly initialSession: Session;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /** How long before idle expiry the warning dialog appears. */
  readonly warningLeadMs?: number;
  /** How long before the absolute (maximum-length) expiry the warning appears. */
  readonly absoluteWarningLeadMs?: number;
  /** Minimum interval between activity-driven keep-alive calls. */
  readonly keepAliveThrottleMs?: number;
  readonly onSignedOut?: () => void;
  readonly channelName?: string;
  /** A state listener threw (it is isolated from the others and from the lifecycle). */
  readonly onListenerError?: (error: unknown) => void;
}

type ChannelMessage = { type: 'renewed'; session: Session } | { type: 'signed-out' };

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export async function fetchSession(fetchImpl: typeof fetch = fetch): Promise<Session | null> {
  const response = await fetchImpl(authPaths.session, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Session lookup failed with HTTP ${response.status}`);
  return SessionSchema.parse(await response.json());
}

export function buildLoginUrl(returnTo?: string): string {
  const target =
    returnTo ??
    (typeof location === 'undefined'
      ? '/'
      : `${location.pathname}${location.search}${location.hash}`);
  return `${authPaths.login}?returnTo=${encodeURIComponent(target)}`;
}

/**
 * Client half of the session lifecycle. The BFF is authoritative (idle and
 * absolute timeouts are enforced server-side); this manager keeps the UI
 * honest about it:
 *
 *  - user activity (not background polling or the SSE stream) extends the
 *    idle timeout, throttled to one keep-alive per minute;
 *  - a warning appears shortly before idle expiry with a live countdown;
 *  - sign-out and renewals propagate to every tab via BroadcastChannel.
 */
export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const {
    fetch: fetchImpl = fetch.bind(globalThis),
    now = Date.now,
    warningLeadMs = 60_000,
    absoluteWarningLeadMs = 5 * 60_000,
    keepAliveThrottleMs = 60_000,
    onSignedOut,
    channelName = 'meridian.session',
    onListenerError,
  } = options;

  // Frozen: `host.auth.getSession()` hands this very object to every remote.
  let session = deepFreeze(options.initialSession);
  let phase: SessionPhase = 'active';
  // Loading the app does not extend the session server-side, so the first
  // activity after a load must be allowed to send a keep-alive.
  let lastKeepAlive = Number.NEGATIVE_INFINITY;
  // Server clock minus client clock, so deadlines are judged in server time: a
  // client clock that is minutes off must not expire or never warn a session.
  let clockSkewMs = 0;
  const trackSkew = (next: Session) => {
    if (next.serverTime) clockSkewMs = Date.parse(next.serverTime) - now();
  };
  trackSkew(session);
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let keepAliveInFlight: Promise<void> | null = null;
  const listeners = new Set<(state: SessionState) => void>();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(channelName) : null;

  const serverNow = () => now() + clockSkewMs;
  const limit = (): SessionState['limit'] =>
    Date.parse(session.absoluteExpiresAt) <= Date.parse(session.expiresAt) ? 'absolute' : 'idle';
  const expiresAt = () =>
    Math.min(Date.parse(session.expiresAt), Date.parse(session.absoluteExpiresAt));
  const snapshot = (): SessionState => ({
    phase,
    session,
    remainingMs: Math.max(0, expiresAt() - serverNow()),
    limit: limit(),
  });
  // The state object only changes when something is emitted (phase change,
  // renewal, countdown tick), so `getState()` is referentially stable between
  // emits and safe for `useSyncExternalStore`.
  let state = snapshot();
  const emit = () => {
    state = snapshot();
    notifyAll(listeners, [state], onListenerError);
  };
  const getState = () => state;
  const setPhase = (next: SessionPhase) => {
    if (phase === next) return;
    phase = next;
    emit();
  };

  const evaluate = () => {
    if (phase === 'expired' || phase === 'signed-out') return;
    const remaining = expiresAt() - serverNow();
    const lead = limit() === 'absolute' ? absoluteWarningLeadMs : warningLeadMs;
    if (remaining <= 0) setPhase('expired');
    else if (remaining <= lead) {
      if (phase !== 'expiring') setPhase('expiring');
      else emit(); // countdown tick
    } else setPhase('active');
  };

  const applySession = (next: Session, broadcast: boolean) => {
    session = deepFreeze(next);
    trackSkew(next);
    if (broadcast)
      channel?.postMessage({ type: 'renewed', session: next } satisfies ChannelMessage);
    // A renewal revives an active, expiring or expired session (another tab may have
    // re-authenticated after this one saw a 401); `evaluate` re-expires it if the new
    // deadline has already passed. Only an explicit sign-out is final.
    if (phase !== 'signed-out') phase = 'active';
    evaluate();
    emit();
  };

  const keepAlive = (): Promise<void> => {
    if (phase === 'expired' || phase === 'signed-out') return Promise.resolve();
    if (keepAliveInFlight) return keepAliveInFlight;
    lastKeepAlive = now();
    keepAliveInFlight = (async () => {
      try {
        const response = await fetchImpl(authPaths.keepAlive, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { accept: 'application/json', 'x-csrf-token': session.csrfToken },
        });
        if (response.status === 401) {
          setPhase('expired');
          return;
        }
        if (response.ok) applySession(SessionSchema.parse(await response.json()), true);
      } finally {
        keepAliveInFlight = null;
      }
    })();
    return keepAliveInFlight;
  };

  const onActivity = () => {
    // While the warning is visible only an explicit choice extends the session.
    if (phase !== 'active') return;
    if (now() - lastKeepAlive >= keepAliveThrottleMs) void keepAlive().catch(() => undefined);
  };

  const endSession = (broadcast: boolean) => {
    if (phase === 'signed-out') return;
    if (broadcast) channel?.postMessage({ type: 'signed-out' } satisfies ChannelMessage);
    try {
      setPhase('signed-out');
    } finally {
      onSignedOut?.(); // always leave the page, whatever a listener did
    }
  };

  if (channel) {
    channel.onmessage = (event: MessageEvent<unknown>) => {
      // Same origin only, but another tab may run an older build: validate before adopting.
      const data = event.data as Partial<ChannelMessage> | null;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'renewed') {
        const parsed = SessionSchema.safeParse(data.session);
        if (parsed.success) applySession(parsed.data, false);
      } else if (data.type === 'signed-out') endSession(false);
    };
  }
  if (typeof window !== 'undefined') {
    for (const type of ACTIVITY_EVENTS)
      window.addEventListener(type, onActivity, { passive: true, capture: true });
  }
  tickTimer = setInterval(evaluate, 1_000);
  evaluate();

  return {
    getState,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    keepAlive,
    apply(next) {
      lastKeepAlive = now();
      applySession(next, true);
    },
    async simulateExpiry() {
      if (session.authMode !== 'mock') return;
      const response = await fetchImpl(authPaths.simulateExpiry, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'x-csrf-token': session.csrfToken },
      });
      if (!response.ok) throw new Error(`Could not simulate the timeout (HTTP ${response.status})`);
      applySession(SessionSchema.parse(await response.json()), true);
    },
    async signOut() {
      try {
        await fetchImpl(authPaths.logout, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'x-csrf-token': session.csrfToken },
        });
      } finally {
        endSession(true);
      }
    },
    handleUnauthorized() {
      if (phase !== 'signed-out') setPhase('expired');
    },
    loginUrl: buildLoginUrl,
    dispose() {
      clearInterval(tickTimer);
      tickTimer = undefined;
      channel?.close();
      if (typeof window !== 'undefined') {
        for (const type of ACTIVITY_EVENTS)
          window.removeEventListener(type, onActivity, { capture: true });
      }
      listeners.clear();
    },
  };
}
