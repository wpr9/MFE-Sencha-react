import type { ConnectionStatus, MarketDataApi, Quote, Unsubscribe } from '@meridian/contracts';
import { notifyAll } from './listeners';

interface Subscription {
  readonly symbols: ReadonlySet<string> | '*';
  readonly listener: (quotes: ReadonlyMap<string, Quote>) => void;
}

export interface MarketDataService {
  readonly api: MarketDataApi;
  /** Feeds quotes from the realtime stream or a REST snapshot. */
  ingest(quotes: readonly Quote[]): void;
  setStatus(status: ConnectionStatus): void;
}

export interface MarketDataOptions {
  /** Frame scheduler; defaults to requestAnimationFrame. Injected in tests. */
  readonly schedule?: (flush: () => void) => void;
  readonly onListenerError?: (error: unknown) => void;
}

const defaultSchedule = (flush: () => void) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => flush());
  else setTimeout(flush, 16);
};

/**
 * Quote cache + fan-out. Ticks are coalesced and delivered at most once per
 * animation frame, and each subscriber only receives the symbols it asked
 * for, so a burst of 500 ticks causes one render per view - not 500.
 */
export function createMarketDataService(options: MarketDataOptions = {}): MarketDataService {
  const { schedule = defaultSchedule, onListenerError } = options;
  const quotes = new Map<string, Quote>();
  const subscriptions = new Set<Subscription>();
  const pending = new Map<string, Quote>();
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let status: ConnectionStatus = 'connecting';
  let flushScheduled = false;

  const flush = () => {
    flushScheduled = false;
    if (pending.size === 0) return;
    const batch = new Map(pending);
    pending.clear();
    for (const subscription of [...subscriptions]) {
      let delivery: Map<string, Quote> | undefined;
      if (subscription.symbols === '*') {
        delivery = new Map(batch); // own copy: a subscriber must not edit what the next one sees
      } else {
        for (const symbol of subscription.symbols) {
          const quote = batch.get(symbol);
          if (quote) (delivery ??= new Map()).set(symbol, quote);
        }
      }
      if (!delivery) continue;
      try {
        subscription.listener(delivery);
      } catch (error) {
        onListenerError?.(error);
      }
    }
  };

  const api: MarketDataApi = Object.freeze({
    getQuote: (symbol: string) => quotes.get(symbol),
    subscribe(symbols, listener): Unsubscribe {
      const subscription: Subscription = {
        symbols: symbols === '*' ? '*' : new Set(symbols),
        listener,
      };
      subscriptions.add(subscription);
      return () => {
        subscriptions.delete(subscription);
      };
    },
    getStatus: () => status,
    subscribeStatus(listener): Unsubscribe {
      statusListeners.add(listener);
      return () => {
        statusListeners.delete(listener);
      };
    },
  } satisfies MarketDataApi);

  return {
    api,
    ingest(batch) {
      for (const quote of batch) {
        const current = quotes.get(quote.symbol);
        if (current && current.timestamp > quote.timestamp) continue; // stale
        const shared = Object.freeze(quote); // handed to every subscriber by reference
        quotes.set(quote.symbol, shared);
        pending.set(quote.symbol, shared);
      }
      if (pending.size > 0 && !flushScheduled) {
        flushScheduled = true;
        schedule(flush);
      }
    },
    setStatus(next) {
      if (next === status) return;
      status = next;
      notifyAll(statusListeners, [next], onListenerError);
    },
  };
}
