import type { StreamEvent } from '@meridian/contracts';

/** One published event, serialised once for every stream it is fanned out to. */
export interface HubEntry {
  /** Sequence number for replay; `null` for quotes, which are never replayed. */
  readonly id: number | null;
  readonly event: StreamEvent;
  /** `JSON.stringify(event)`, the SSE `data:` field. */
  readonly data: string;
}

/**
 * In-process event hub feeding the SSE endpoint. Business events (orders,
 * alerts, portfolio changes) are sequenced and kept in a bounded replay
 * buffer so reconnecting clients receive what they missed; quotes are
 * fire-and-forget (the next tick supersedes them).
 */
export class EventHub {
  private sequence = 0;
  private readonly buffer: HubEntry[] = [];
  private readonly listeners = new Set<(entry: HubEntry) => void>();

  constructor(private readonly replaySize = 500) {}

  publish(event: StreamEvent): void {
    const data = JSON.stringify(event);
    const entry: HubEntry =
      event.type === 'quotes'
        ? { id: null, event, data }
        : { id: (this.sequence += 1), event, data };
    if (entry.id !== null) {
      this.buffer.push(entry);
      if (this.buffer.length > this.replaySize) this.buffer.shift();
    }
    for (const listener of this.listeners) listener(entry);
  }

  /** Drops the replay buffer; sequence numbers keep increasing. Used once, after seeding. */
  reset(): void {
    this.buffer.length = 0;
  }

  replaySince(lastId: number): HubEntry[] {
    return this.buffer.filter((entry) => entry.id !== null && entry.id > lastId);
  }

  subscribe(listener: (entry: HubEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
