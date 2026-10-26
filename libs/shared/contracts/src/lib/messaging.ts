import { z } from 'zod';
import {
  ComplianceAlertSchema,
  OrderSchema,
  OrderSideSchema,
  OrderStatusSchema,
  OrderTypeSchema,
  QuoteSchema,
  type ComplianceAlert,
  type Order,
  type OrderStatus,
} from './domain';

export type Unsubscribe = () => void;

/* ------------------------------------------------------------------ Events */

/**
 * Events are immutable facts ("something happened"), broadcast to any number
 * of subscribers. Publishers never know who listens.
 */
export interface MeridianEventMap {
  /** An order was created (server-confirmed). */
  'order.created': { readonly order: Order };
  /** An order changed state or was (partially) filled. */
  'order.updated': { readonly order: Order; readonly previousStatus: OrderStatus | null };
  /** The user focused an order in a blotter; other views may follow along. */
  'order.focused': {
    readonly orderId: string;
    readonly portfolioId: string;
    readonly symbol: string;
  };
  /** The user focused a security anywhere in the workspace. */
  'security.focused': { readonly symbol: string };
  /** Positions/valuation of a portfolio changed (e.g. after a fill). */
  'portfolio.changed': {
    readonly portfolioId: string;
    readonly reason: 'fill' | 'cash' | 'rebalance';
  };
  'compliance.alert.raised': { readonly alert: ComplianceAlert };
  'compliance.alert.updated': { readonly alert: ComplianceAlert };
}

export type MeridianEventTopic = keyof MeridianEventMap & string;

export interface EventEnvelope<K extends MeridianEventTopic = MeridianEventTopic> {
  readonly id: string;
  readonly topic: K;
  readonly payload: MeridianEventMap[K];
  /** Logical publisher: `server`, `shell` or a remote name. */
  readonly source: string;
  readonly timestamp: number;
  readonly correlationId?: string;
}

/**
 * An envelope of *some* topic, with payload correlated to it: `switch
 * (envelope.topic)` narrows `envelope.payload` (an `EventEnvelope` with the
 * topic union would not).
 */
export type AnyEventEnvelope = { [K in MeridianEventTopic]: EventEnvelope<K> }[MeridianEventTopic];

export interface EventBus {
  publish<K extends MeridianEventTopic>(
    topic: K,
    payload: MeridianEventMap[K],
    options?: { readonly correlationId?: string },
  ): void;
  subscribe<K extends MeridianEventTopic>(
    topic: K,
    handler: (payload: MeridianEventMap[K], envelope: EventEnvelope<K>) => void,
  ): Unsubscribe;
  /** Observe every event (devtools, telemetry). */
  subscribeAll(handler: (envelope: AnyEventEnvelope) => void): Unsubscribe;
}

/* ----------------------------------------------------------------- Intents */

/**
 * Prefill for the order ticket. Every field is optional. Intent payloads
 * cross a module boundary, so the shell validates them with this schema.
 */
export const TradeTicketDraftSchema = z.object({
  portfolioId: z.string().optional(),
  symbol: z.string().optional(),
  side: OrderSideSchema.optional(),
  quantity: z.number().positive().optional(),
  orderType: OrderTypeSchema.optional(),
  limitPrice: z.number().positive().optional(),
});
export type TradeTicketDraft = z.infer<typeof TradeTicketDraftSchema>;

/**
 * Intents are requests addressed to "whoever can handle this" ("open a trade
 * ticket for AAPL"). Exactly one handler - registered by the shell - resolves
 * an intent, which keeps remotes ignorant of each other's routes and of
 * which remote renders what.
 */
export interface MeridianIntentMap {
  'trade.ticket.open': TradeTicketDraft;
  'order.open': { readonly orderId: string };
  'portfolio.open': {
    readonly portfolioId: string;
    readonly tab?: 'overview' | 'holdings' | 'risk';
  };
  'compliance.alert.open': { readonly alertId: string };
  'security.open': { readonly symbol: string };
}

export type MeridianIntent = keyof MeridianIntentMap & string;

/** Identifiers as the BFF issues them (`ORD-24118`, `GEQ`, `ALT-…`). */
const IdSchema = z.string().min(1).max(64);

/**
 * Payload schema per intent. The shell validates every dispatch with these
 * before acting, so a malformed payload from one remote is refused at the
 * boundary instead of becoming a broken URL or a bad request.
 */
export const IntentPayloadSchemas = {
  'trade.ticket.open': TradeTicketDraftSchema,
  'order.open': z.object({ orderId: IdSchema }),
  'portfolio.open': z.object({
    portfolioId: IdSchema,
    tab: z.enum(['overview', 'holdings', 'risk']).optional(),
  }),
  'compliance.alert.open': z.object({ alertId: IdSchema }),
  'security.open': z.object({ symbol: z.string().min(1).max(32) }),
} satisfies Record<MeridianIntent, z.ZodType>;

export type IntentRequest = {
  [K in MeridianIntent]: { readonly intent: K; readonly payload: MeridianIntentMap[K] };
}[MeridianIntent];

/* ----------------------------------------------------- Server-sent stream */

/**
 * Events pushed by the BFF over `GET /api/stream` (Server-Sent Events). The
 * SSE `event:` field carries `type`; `data:` carries the JSON object.
 */
export const StreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quotes'), quotes: z.array(QuoteSchema) }),
  z.object({ type: z.literal('order.created'), order: OrderSchema }),
  z.object({
    type: z.literal('order.updated'),
    order: OrderSchema,
    previousStatus: OrderStatusSchema.nullable(),
  }),
  z.object({ type: z.literal('alert.raised'), alert: ComplianceAlertSchema }),
  z.object({ type: z.literal('alert.updated'), alert: ComplianceAlertSchema }),
  z.object({
    type: z.literal('portfolio.changed'),
    portfolioId: z.string(),
    reason: z.enum(['fill', 'cash', 'rebalance']),
  }),
  z.object({ type: z.literal('session.ended'), reason: z.enum(['logout', 'expired', 'revoked']) }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;
export type StreamEventType = StreamEvent['type'];
export const STREAM_EVENT_TYPES: readonly StreamEventType[] = StreamEventSchema.options.map(
  (option) => option.shape.type.value,
);
