import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatRelativeTime,
  formatSignedPercent,
} from '@meridian/formatting';
import { describeError } from '@meridian/contracts';
import type {
  ConnectionStatus,
  EventEnvelope,
  FeatureFlag,
  HostApi,
  HostStateSnapshot,
  MeridianEventMap,
  MeridianEventTopic,
  MeridianIntent,
  MeridianIntentMap,
  Permission,
  Quote,
} from '@meridian/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

const HostContext = createContext<HostApi | null>(null);

/** Makes a remote's scoped Host API available to its React tree (installed by `defineReactRemote`). */
export function HostProvider({
  host,
  children,
}: {
  readonly host: HostApi;
  readonly children: ReactNode;
}) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}

/** The scoped Host API of the current remote. */
export function useHost(): HostApi {
  const host = useContext(HostContext);
  if (!host)
    throw new Error('useHost() must be used inside a remote mounted with defineReactRemote()');
  return host;
}

/**
 * Reads cross-cutting shell state (theme, density, locale, portfolio context).
 * The selector must return a primitive or a value from the snapshot itself:
 * `useSyncExternalStore` re-renders whenever the selected value is not `===`.
 */
export function useHostState<T>(selector: (state: HostStateSnapshot) => T): T {
  const host = useHost();
  const subscribe = useCallback(
    (notify: () => void) => host.state.subscribe(() => notify()),
    [host],
  );
  return useSyncExternalStore(subscribe, () => selector(host.state.getSnapshot()));
}

/** Subscribes to a platform event for the component's lifetime (handler may change freely). */
export function useHostEvent<K extends MeridianEventTopic>(
  topic: K,
  handler: (payload: MeridianEventMap[K], envelope: EventEnvelope<K>) => void,
): void {
  const host = useHost();
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  useEffect(
    () => host.events.subscribe(topic, (payload, envelope) => latest.current(payload, envelope)),
    [host, topic],
  );
}

/** UX gating only - the BFF enforces the same permission on every route. */
export function usePermission(permission: Permission): boolean {
  const host = useHost();
  const subscribe = useCallback(
    (notify: () => void) => host.auth.subscribe(() => notify()),
    [host],
  );
  return useSyncExternalStore(subscribe, () => host.auth.hasPermission(permission));
}

/** Server-evaluated feature flag (plus local overrides outside production). */
export function useFlag(flag: FeatureFlag): boolean {
  return useHost().flags.isEnabled(flag);
}

/** Live quotes for `symbols`; re-renders at most once per animation frame. */
export function useQuotes(symbols: readonly string[]): ReadonlyMap<string, Quote> {
  const host = useHost();
  const key = symbols.join(',');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!key) return undefined;
    return host.marketData.subscribe(key.split(','), () => setVersion((v) => v + 1));
  }, [host, key]);
  return useMemo(() => {
    const quotes = new Map<string, Quote>();
    for (const symbol of key ? key.split(',') : []) {
      const quote = host.marketData.getQuote(symbol);
      if (quote) quotes.set(symbol, quote);
    }
    return quotes;
    // `version` is the change signal from the subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, key, version]);
}

/** Live quote for one symbol; re-renders at most once per animation frame. */
export function useQuote(symbol: string | null | undefined): Quote | undefined {
  const quotes = useQuotes(symbol ? [symbol] : []);
  return symbol ? quotes.get(symbol) : undefined;
}

/** State of the shared real-time stream (quotes, orders, alerts). */
export function useConnectionStatus(): ConnectionStatus {
  const host = useHost();
  const subscribe = useCallback(
    (notify: () => void) => host.marketData.subscribeStatus(() => notify()),
    [host],
  );
  return useSyncExternalStore(subscribe, () => host.marketData.getStatus());
}

/**
 * The current time, refreshed on an interval, for relative timestamps ("2 minutes
 * ago") that must not go stale while nothing else re-renders. Pass it to
 * `f.relative(value, now)`.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Dispatches an intent and surfaces failures as a toast. */
export function useIntent() {
  const host = useHost();
  return useCallback(
    <K extends MeridianIntent>(intent: K, payload: MeridianIntentMap[K]) => {
      host.intents.dispatch(intent, payload).catch((error: unknown) => {
        host.notifications.toast({
          severity: 'error',
          message: describeError(error),
        });
      });
    },
    [host],
  );
}

/** Formatters bound to the user's locale. */
export function useFormatters() {
  const locale = useHostState((state) => state.locale);
  return useMemo(
    () => ({
      currency: (value: number | null | undefined, compact = false) =>
        formatCurrency(value, { locale, compact }),
      signedCurrency: (value: number | null | undefined, compact = false) =>
        formatCurrency(value, { locale, compact, signDisplay: 'exceptZero' }),
      number: (value: number | null | undefined, digits = 2) =>
        formatNumber(value, {
          locale,
          maximumFractionDigits: digits,
          minimumFractionDigits: digits,
        }),
      /** Signed delta with fixed decimals (price changes) - not the 4-dp sub-dollar price format. */
      signed: (value: number | null | undefined, digits = 2) =>
        formatNumber(value, {
          locale,
          signDisplay: 'exceptZero',
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }),
      quantity: (value: number | null | undefined) => formatQuantity(value, { locale }),
      price: (value: number | null | undefined) => formatPrice(value, { locale }),
      percent: (value: number | null | undefined, decimals = 2) =>
        formatPercent(value, { locale, decimals }),
      signedPercent: (value: number | null | undefined, decimals = 2) =>
        formatSignedPercent(value, { locale, decimals }),
      dateTime: (value: string | number | Date | null | undefined) =>
        formatDateTime(value, { locale }),
      time: (value: string | number | Date | null | undefined) =>
        formatDateTime(value, { locale, style: 'time' }),
      /** HH:MM, for axis ticks and dense tables. */
      shortTime: (value: string | number | Date | null | undefined) =>
        formatDateTime(value, { locale, style: 'shortTime' }),
      /** Large counts such as volume: `28.3M`. */
      compact: (value: number | null | undefined, digits = 1) =>
        formatNumber(value, { locale, compact: true, maximumFractionDigits: digits }),
      date: (value: string | number | Date | null | undefined) =>
        formatDateTime(value, { locale, style: 'date' }),
      /** `Oct 23`, for axis ticks. */
      shortDate: (value: string | number | Date | null | undefined) =>
        formatDateTime(value, { locale, style: 'shortDate' }),
      /** "2 minutes ago"; pass `now` from `useNow()` so the text refreshes. */
      relative: (value: string | number | Date, now?: number) =>
        formatRelativeTime(value, { locale, now }),
    }),
    [locale],
  );
}
