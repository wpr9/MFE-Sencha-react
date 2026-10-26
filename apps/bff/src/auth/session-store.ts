import type { Permission, Session } from '@meridian/contracts';
import { token } from '../lib/crypto';
import { flagsFor, permissionsFor, type Persona } from './personas';

export interface ServerSession {
  readonly id: string;
  readonly persona: Persona;
  /** Effective permissions, computed once at sign-in; checked on every request and event. */
  readonly permissions: ReadonlySet<Permission>;
  readonly csrfToken: string;
  readonly issuedAt: number;
  expiresAt: number;
  readonly absoluteExpiresAt: number;
}

/** Expired sessions are reaped this often; lookups also expire them lazily. */
const SWEEP_INTERVAL_MS = 30_000;

export interface SessionStoreOptions {
  readonly idleTimeoutSeconds: number;
  readonly absoluteTimeoutSeconds: number;
  readonly now?: () => number;
}

/**
 * Server-side session store (in-memory for the mock; Redis/Memorystore in
 * production). The browser only ever holds an opaque, HttpOnly session id.
 *
 * Idle expiry is extended exclusively by explicit keep-alives that the client
 * sends on real user activity - background polling and the SSE stream do not
 * keep an abandoned terminal signed in.
 */
export class SessionStore {
  private readonly sessions = new Map<string, ServerSession>();
  private readonly now: () => number;
  private readonly endedListeners = new Set<
    (sessionId: string, reason: 'logout' | 'expired') => void
  >();

  private readonly sweeper: NodeJS.Timeout;

  constructor(private readonly options: SessionStoreOptions) {
    this.now = options.now ?? Date.now;
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  dispose(): void {
    clearInterval(this.sweeper);
  }

  create(persona: Persona): ServerSession {
    const issuedAt = this.now();
    const session: ServerSession = {
      id: token(),
      persona,
      permissions: new Set(permissionsFor(persona.roles)),
      csrfToken: token(24),
      issuedAt,
      expiresAt: issuedAt + this.options.idleTimeoutSeconds * 1000,
      absoluteExpiresAt: issuedAt + this.options.absoluteTimeoutSeconds * 1000,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string | undefined): ServerSession | undefined {
    if (!id) return undefined;
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (this.isExpired(session)) {
      this.end(session.id, 'expired');
      return undefined;
    }
    return session;
  }

  keepAlive(session: ServerSession): void {
    session.expiresAt = Math.min(
      this.now() + this.options.idleTimeoutSeconds * 1000,
      session.absoluteExpiresAt,
    );
  }

  /** Demo helper: make the idle timeout lapse soon so the warning UX can be shown. */
  expireSoon(session: ServerSession, inSeconds: number): void {
    session.expiresAt = Math.min(this.now() + inSeconds * 1000, session.absoluteExpiresAt);
  }

  end(id: string, reason: 'logout' | 'expired'): void {
    if (this.sessions.delete(id)) {
      for (const listener of this.endedListeners) listener(id, reason);
    }
  }

  onEnded(listener: (sessionId: string, reason: 'logout' | 'expired') => void): () => void {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  toDocument(session: ServerSession): Session {
    const { persona } = session;
    return {
      user: persona.user,
      roles: [...persona.roles],
      permissions: [...session.permissions],
      entitlements: {
        portfolios: persona.entitlements.all
          ? { all: true }
          : { all: false, ids: [...persona.entitlements.ids] },
      },
      flags: flagsFor(persona),
      csrfToken: session.csrfToken,
      issuedAt: new Date(session.issuedAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      absoluteExpiresAt: new Date(session.absoluteExpiresAt).toISOString(),
      idleTimeoutSeconds: this.options.idleTimeoutSeconds,
      authMode: 'mock',
      serverTime: new Date(this.now()).toISOString(),
    };
  }

  private isExpired(session: ServerSession): boolean {
    const now = this.now();
    return now >= session.expiresAt || now >= session.absoluteExpiresAt;
  }

  private sweep(): void {
    for (const session of this.sessions.values()) {
      if (this.isExpired(session)) this.end(session.id, 'expired');
    }
  }
}
