import type {
  AnyEventEnvelope,
  EventBus,
  EventEnvelope,
  MeridianEventMap,
  MeridianEventTopic,
  Unsubscribe,
} from '@meridian/contracts';
import { randomId } from './ids';

type AnyHandler = (payload: unknown, envelope: EventEnvelope) => void;

export interface EventBusOptions {
  /** Called when a subscriber throws; other subscribers still run. */
  readonly onHandlerError?: (error: unknown, envelope: EventEnvelope) => void;
  /** Number of recent envelopes kept for the event inspector. */
  readonly historySize?: number;
}

export interface EventBusController {
  /** A bus whose publications are attributed to `source`. */
  forSource(source: string): EventBus;
  publish<K extends MeridianEventTopic>(
    source: string,
    topic: K,
    payload: MeridianEventMap[K],
    correlationId?: string,
  ): void;
  history(): readonly AnyEventEnvelope[];
  subscribeAll(handler: (envelope: AnyEventEnvelope) => void): Unsubscribe;
}

/**
 * In-memory, typed publish/subscribe bus.
 *
 * - Delivery is synchronous and in subscription order (predictable, testable).
 * - Subscriber failures are isolated: one throwing remote cannot break others.
 * - The handler list is snapshotted per publish, so unsubscribing during
 *   dispatch is safe.
 * - Envelopes are frozen; payloads are treated as immutable by convention.
 */
export function createEventBus(options: EventBusOptions = {}): EventBusController {
  const { onHandlerError, historySize = 200 } = options;
  const handlers = new Map<string, Set<AnyHandler>>();
  const wildcard = new Set<(envelope: AnyEventEnvelope) => void>();
  const recent: AnyEventEnvelope[] = [];

  const invoke = (fn: () => void, envelope: EventEnvelope) => {
    try {
      fn();
    } catch (error) {
      if (onHandlerError) onHandlerError(error, envelope);
      else console.error(`[event-bus] subscriber of "${envelope.topic}" failed`, error);
    }
  };

  const publish = <K extends MeridianEventTopic>(
    source: string,
    topic: K,
    payload: MeridianEventMap[K],
    correlationId?: string,
  ) => {
    // Built from a typed publish, so topic and payload are correlated by construction.
    const envelope = Object.freeze({
      id: randomId(),
      topic,
      payload,
      source,
      timestamp: Date.now(),
      ...(correlationId ? { correlationId } : {}),
    }) as EventEnvelope<K> as AnyEventEnvelope;

    recent.push(envelope);
    if (recent.length > historySize) recent.splice(0, recent.length - historySize);

    for (const handler of [...(handlers.get(topic) ?? [])]) {
      invoke(() => handler(payload, envelope), envelope);
    }
    for (const handler of [...wildcard]) {
      invoke(() => handler(envelope), envelope);
    }
  };

  const subscribe = (topic: string, handler: AnyHandler): Unsubscribe => {
    let set = handlers.get(topic);
    if (!set) {
      set = new Set();
      handlers.set(topic, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  };

  const subscribeAll = (handler: (envelope: AnyEventEnvelope) => void): Unsubscribe => {
    wildcard.add(handler);
    return () => {
      wildcard.delete(handler);
    };
  };

  return {
    publish,
    subscribeAll,
    history: () => recent.slice(),
    forSource(source) {
      return Object.freeze({
        publish: (topic, payload, publishOptions) =>
          publish(source, topic, payload, publishOptions?.correlationId),
        subscribe: (topic, handler) => subscribe(topic, handler as AnyHandler),
        subscribeAll,
      } satisfies EventBus);
    },
  };
}
