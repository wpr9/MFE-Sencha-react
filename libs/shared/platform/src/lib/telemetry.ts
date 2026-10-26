import type {
  TelemetryApi,
  TelemetryAttributes,
  TelemetryBatch,
  TelemetryRecord,
} from '@meridian/contracts';

export type { TelemetryKind, TelemetryRecord } from '@meridian/contracts';

export interface TelemetryOptions {
  readonly endpoint: string;
  readonly app: string;
  readonly version: string;
  readonly flushIntervalMs?: number;
  readonly maxBatchSize?: number;
  readonly historySize?: number;
  /** Mirror records to the console (development builds). */
  readonly debug?: boolean;
  /** Override the transport (tests). */
  readonly send?: (records: readonly TelemetryRecord[]) => void;
}

export interface Telemetry {
  forSource(source: string): TelemetryApi;
  vital(name: string, value: number, attributes?: TelemetryAttributes): void;
  flush(): void;
  recent(): readonly TelemetryRecord[];
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

function normaliseError(error: unknown): NonNullable<TelemetryRecord['error']> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 8).join('\n'),
    };
  }
  return { name: 'NonError', message: typeof error === 'string' ? error : JSON.stringify(error) };
}

/**
 * Buffered telemetry pipeline. Records are batched and shipped with
 * `navigator.sendBeacon`, which survives page unloads, every few seconds and
 * whenever the page is hidden. Only route paths and caller-supplied
 * attributes are recorded - never request bodies or query strings.
 */
export function createTelemetry(options: TelemetryOptions): Telemetry {
  const {
    endpoint,
    app,
    version,
    flushIntervalMs = 5_000,
    maxBatchSize = 50,
    historySize = 200,
    debug = false,
  } = options;
  const buffer: TelemetryRecord[] = [];
  const history: TelemetryRecord[] = [];
  const listeners = new Set<() => void>();

  const send =
    options.send ??
    ((records: readonly TelemetryRecord[]) => {
      const body = JSON.stringify({ app, version, records: [...records] } satisfies TelemetryBatch);
      const sent =
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function' &&
        navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      if (!sent) {
        void fetch(endpoint, {
          method: 'POST',
          body,
          keepalive: true,
          headers: { 'content-type': 'application/json' },
        }).catch(() => undefined);
      }
    });

  const flush = () => {
    while (buffer.length > 0) send(buffer.splice(0, maxBatchSize));
  };

  const record = (entry: Omit<TelemetryRecord, 'timestamp' | 'path'>) => {
    const full: TelemetryRecord = {
      ...entry,
      timestamp: Date.now(),
      path: typeof location === 'undefined' ? '' : location.pathname,
    };
    buffer.push(full);
    history.push(full);
    if (history.length > historySize) history.splice(0, history.length - historySize);
    if (debug && entry.kind !== 'event')
      console.debug(`[telemetry] ${entry.kind} ${entry.name}`, full);
    if (buffer.length >= maxBatchSize) flush();
    for (const listener of [...listeners]) listener();
  };

  const timer = setInterval(flush, flushIntervalMs);
  const onHidden = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHidden);
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);

  return {
    forSource(source) {
      return Object.freeze({
        track: (name, attributes = {}) => record({ kind: 'event', name, source, attributes }),
        error: (error, attributes = {}) =>
          record({
            kind: 'error',
            name: 'error',
            source,
            attributes,
            error: normaliseError(error),
          }),
        async measure(name, work, attributes = {}) {
          const startedAt = performance.now();
          try {
            return await work();
          } finally {
            record({
              kind: 'timing',
              name,
              source,
              attributes,
              value: Math.round(performance.now() - startedAt),
            });
          }
        },
      } satisfies TelemetryApi);
    },
    vital: (name, value, attributes = {}) =>
      record({ kind: 'vital', name, source: app, attributes, value }),
    flush,
    recent: () => history.slice(),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      clearInterval(timer);
      flush();
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', onHidden);
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', flush);
    },
  };
}

/** Core Web Vitals (Google's `web-vitals` library) into the telemetry pipeline. */
export async function reportWebVitals(telemetry: Telemetry): Promise<void> {
  const { onCLS, onINP, onLCP, onFCP, onTTFB } = await import('web-vitals');
  const report = (metric: {
    name: string;
    value: number;
    rating: string;
    navigationType: string;
  }) =>
    telemetry.vital(metric.name, metric.value, {
      rating: metric.rating,
      navigationType: metric.navigationType,
    });
  onCLS(report);
  onINP(report);
  onLCP(report);
  onFCP(report);
  onTTFB(report);
}
