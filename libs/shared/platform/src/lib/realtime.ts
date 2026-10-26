import {
  STREAM_EVENT_TYPES,
  StreamEventSchema,
  type ConnectionStatus,
  type StreamEvent,
  type Unsubscribe,
} from '@meridian/contracts';
import { notifyAll } from './listeners';

/** `EventSource.CLOSED`, inlined so the module loads where EventSource is absent. */
const EVENT_SOURCE_CLOSED = 2;

export interface RealtimeOptions {
  readonly url: string;
  readonly onEvent: (event: StreamEvent) => void;
  readonly onInvalidEvent?: (error: unknown, raw: string) => void;
  readonly createEventSource?: (url: string) => EventSource;
  readonly initialBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly random?: () => number;
  /** A status listener threw (it is isolated from the others and from reconnection). */
  readonly onListenerError?: (error: unknown) => void;
}

export interface RealtimeConnection {
  start(): void;
  stop(): void;
  getStatus(): ConnectionStatus;
  subscribeStatus(listener: (status: ConnectionStatus) => void): Unsubscribe;
}

/**
 * Single Server-Sent Events connection shared by the whole workspace.
 *
 * EventSource reconnects by itself after network blips, but gives up for
 * good on HTTP errors (e.g. 401/503). We then reconnect with exponential
 * backoff + full jitter (avoids thundering herds after a deploy) and resume
 * from the last event id so order/alert events missed while disconnected are
 * replayed by the server.
 */
export function createRealtimeConnection(options: RealtimeOptions): RealtimeConnection {
  const {
    url,
    onEvent,
    onInvalidEvent,
    createEventSource = (target) => new EventSource(target, { withCredentials: true }),
    initialBackoffMs = 1_000,
    maxBackoffMs = 30_000,
    random = Math.random,
    onListenerError,
  } = options;

  let source: EventSource | null = null;
  let status: ConnectionStatus = 'connecting';
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let lastEventId: string | null = null;
  let running = false;
  const statusListeners = new Set<(status: ConnectionStatus) => void>();

  const setStatus = (next: ConnectionStatus) => {
    if (next === status) return;
    status = next;
    notifyAll(statusListeners, [next], onListenerError);
  };

  const handleMessage = (message: MessageEvent<string>) => {
    if (message.lastEventId) lastEventId = message.lastEventId;
    try {
      // The SSE event name is authoritative: a body must not relabel itself (`session.ended`).
      const parsed = StreamEventSchema.parse({ ...JSON.parse(message.data), type: message.type });
      onEvent(parsed);
    } catch (error) {
      onInvalidEvent?.(error, message.data);
    }
  };

  const scheduleReconnect = () => {
    if (!running) return;
    const ceiling = Math.min(maxBackoffMs, initialBackoffMs * 2 ** attempt);
    const delay = Math.round(random() * ceiling);
    attempt += 1;
    // Arm the retry first: nothing a status listener does may cancel reconnection.
    retryTimer = setTimeout(connect, delay);
    setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'reconnecting');
  };

  function connect() {
    if (!running) return;
    const target = lastEventId
      ? `${url}${url.includes('?') ? '&' : '?'}lastEventId=${encodeURIComponent(lastEventId)}`
      : url;
    const eventSource = createEventSource(target);
    source = eventSource;
    eventSource.onopen = () => {
      attempt = 0;
      setStatus('open');
    };
    eventSource.onerror = () => {
      if (eventSource.readyState === EVENT_SOURCE_CLOSED) {
        eventSource.close();
        source = null;
        scheduleReconnect();
      } else {
        setStatus('reconnecting');
      }
    };
    for (const type of STREAM_EVENT_TYPES) {
      eventSource.addEventListener(type, handleMessage as EventListener);
    }
  }

  const handleOnline = () => {
    if (!running || status === 'open') return;
    clearTimeout(retryTimer);
    attempt = 0;
    source?.close();
    source = null;
    connect();
  };
  const handleOffline = () => running && setStatus('offline');

  return {
    start() {
      if (running) return;
      running = true;
      if (typeof window !== 'undefined') {
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
      }
      setStatus('connecting');
      connect();
    },
    stop() {
      running = false;
      clearTimeout(retryTimer);
      source?.close();
      source = null;
      setStatus('offline'); // no stream, no live data: indicators must not keep saying "Live"
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    },
    getStatus: () => status,
    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
  };
}
