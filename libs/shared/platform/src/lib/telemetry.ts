import {
  MAX_ATTRIBUTES,
  type TelemetryApi,
  type TelemetryAttributes,
  type TelemetryBatch,
  type TelemetryRecord,
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

/**
 * Field bounds of `TelemetryRecordSchema`, applied before buffering: the BFF
 * rejects a whole batch over one oversized record, so clipping here keeps the
 * other 49 records alive. Clipped values end with an ellipsis.
 */
const LIMITS = {
  name: 128,
  source: 64,
  path: 512,
  attributeKey: 64,
  attributeValue: 1_024,
  errorName: 128,
  errorMessage: 2_048,
  errorStack: 8_192,
} as const;
/** Chromium queues at most 64 KiB of beacons per page; stay well under it per batch. */
const MAX_BATCH_BYTES = 48 * 1024;

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

function boundAttributes(attributes: TelemetryAttributes): TelemetryRecord['attributes'] {
  const bounded: TelemetryRecord['attributes'] = {};
  for (const [key, value] of Object.entries(attributes).slice(0, MAX_ATTRIBUTES)) {
    bounded[clip(key, LIMITS.attributeKey)] =
      typeof value === 'number' || typeof value === 'boolean' || value == null
        ? value
        : clip(String(value), LIMITS.attributeValue); // strings, and anything a caller slipped in
  }
  return bounded;
}

function normaliseError(error: unknown): NonNullable<TelemetryRecord['error']> {
  if (error instanceof Error) {
    return {
      name: clip(error.name, LIMITS.errorName),
      message: clip(error.message, LIMITS.errorMessage),
      stack: error.stack
        ? clip(error.stack.split('\n').slice(0, 8).join('\n'), LIMITS.errorStack)
        : undefined,
    };
  }
  // `Promise.reject()`, functions, circular structures and BigInt all reach this path.
  let message: string;
  try {
    message = typeof error === 'string' ? error : (JSON.stringify(error) ?? String(error));
  } catch {
    message = String(error);
  }
  return { name: 'NonError', message: clip(message, LIMITS.errorMessage) };
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
    while (buffer.length > 0) {
      // Batches are bounded by count and by bytes; a single oversized record still ships alone.
      const batch: TelemetryRecord[] = [];
      let bytes = 0;
      while (buffer.length > 0 && batch.length < maxBatchSize) {
        const size = JSON.stringify(buffer[0]).length;
        if (batch.length > 0 && bytes + size > MAX_BATCH_BYTES) break;
        bytes += size;
        batch.push(buffer.shift() as TelemetryRecord);
      }
      send(batch);
    }
  };

  const record = (entry: Omit<TelemetryRecord, 'timestamp' | 'path'>) => {
    const full: TelemetryRecord = {
      ...entry,
      name: clip(entry.name, LIMITS.name),
      source: clip(entry.source, LIMITS.source),
      attributes: boundAttributes(entry.attributes),
      timestamp: Date.now(),
      path: clip(typeof location === 'undefined' ? '' : location.pathname, LIMITS.path),
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
