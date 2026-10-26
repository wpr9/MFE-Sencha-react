import type { AnyEventEnvelope, Unsubscribe } from '@meridian/contracts';
import type { HostState, Platform } from '@meridian/platform';
import { useSyncExternalStore } from 'react';

/**
 * Records every message that crosses a micro-frontend boundary so the
 * workspace can *show* its integration model live:
 *
 *  - `state`  shell → all remotes   (host.state: portfolio context, theme, density, locale)
 *  - `props`  shell → one remote    (RemoteInstance.update(props), recorded by RemoteOutlet)
 *  - `event`  remote → subscribers  (host.events, e.g. Ext JS blotter → React insight)
 *  - `intent` remote → shell → remote (host.intents, e.g. "open a trade ticket")
 *  - `server` BFF → remotes         (SSE fan-out through the platform)
 */
export type FlowKind = 'state' | 'props' | 'event' | 'intent' | 'server';

export interface FlowEntry {
  readonly id: number;
  readonly at: number;
  readonly kind: FlowKind;
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly detail: string;
}

export interface MessageFlow {
  record(entry: Omit<FlowEntry, 'id' | 'at'>): void;
  getSnapshot(): readonly FlowEntry[];
  subscribe(listener: () => void): Unsubscribe;
}

/** One line per event for the panel; the switch is exhaustive over the event map. */
function summarizeEvent(envelope: AnyEventEnvelope): string {
  switch (envelope.topic) {
    case 'order.created':
    case 'order.updated': {
      const { order } = envelope.payload;
      return `${order.id} · ${order.side} ${order.symbol} · ${order.status}`;
    }
    case 'order.focused': {
      const { orderId, symbol, portfolioId } = envelope.payload;
      return `${orderId} · ${symbol} · ${portfolioId}`;
    }
    case 'security.focused':
      return envelope.payload.symbol;
    case 'portfolio.changed':
      return `${envelope.payload.portfolioId} · ${envelope.payload.reason}`;
    case 'compliance.alert.raised':
    case 'compliance.alert.updated': {
      const { alert } = envelope.payload;
      return `${alert.id} · ${alert.status} · ${alert.ruleName}`;
    }
  }
}

/** Host-state keys whose changes are worth showing (the rest is internal). */
const STATE_KEYS = [
  'activePortfolioId',
  'locale',
  'theme',
  'density',
] as const satisfies readonly (keyof HostState)[];

/** Entries kept; older ones scroll off. */
const DEFAULT_CAPACITY = 80;

let instance: MessageFlow | null = null;

/** Starts recording; called once by the shell at boot. */
export function startMessageFlow(platform: Platform, capacity = DEFAULT_CAPACITY): MessageFlow {
  let entries: readonly FlowEntry[] = [];
  let sequence = 0;
  const listeners = new Set<() => void>();

  const flow: MessageFlow = {
    record(entry) {
      entries = [{ ...entry, id: (sequence += 1), at: Date.now() }, ...entries].slice(0, capacity);
      for (const listener of [...listeners]) listener();
    },
    getSnapshot: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  platform.bus.subscribeAll((envelope) =>
    flow.record({
      kind: envelope.source === 'server' ? 'server' : 'event',
      from: envelope.source,
      to: 'subscribers',
      label: envelope.topic,
      detail: summarizeEvent(envelope),
    }),
  );
  platform.intents.observe((dispatch) =>
    flow.record({
      kind: 'intent',
      from: dispatch.source,
      to: 'shell',
      label: dispatch.intent,
      detail: `${JSON.stringify(dispatch.payload)} · ${dispatch.outcome}${dispatch.error ? `: ${dispatch.error}` : ''}`,
    }),
  );
  platform.store.subscribe((state, previous) => {
    for (const key of STATE_KEYS) {
      if (state[key] !== previous[key]) {
        flow.record({
          kind: 'state',
          from: 'shell',
          to: 'all remotes',
          label: `state.${key}`,
          detail: String(state[key] ?? 'all portfolios'),
        });
      }
    }
  });

  instance = flow;
  return flow;
}

/** Records a boundary crossing the platform cannot see itself (props); a no-op before boot. */
export function recordMessageFlow(entry: Omit<FlowEntry, 'id' | 'at'>): void {
  instance?.record(entry);
}

const EMPTY: readonly FlowEntry[] = [];
const noop = () => () => undefined;

/** Live entries, newest first. */
export function useMessageFlow(): readonly FlowEntry[] {
  return useSyncExternalStore(instance?.subscribe ?? noop, instance?.getSnapshot ?? (() => EMPTY));
}
