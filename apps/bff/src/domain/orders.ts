import {
  ProblemType,
  TERMINAL_ORDER_STATUSES,
  type Fill,
  type Order,
  type OrderDraft,
  type OrderStatus,
  type PersonRef,
} from '@meridian/contracts';
import type { ComplianceEngine } from './compliance';
import { DomainError, conflict, forbidden, notFound, validation } from './errors';
import type { EventHub } from './events';
import type { MarketSimulator } from './market';
import type { PortfolioBook } from './portfolios';
import { referencePrice } from './pricing';
import { round, type Random } from './random';
import { getSecurity } from './securities';
import { SEED_PLAN } from './seed-plan';

const VENUES = ['NYSE', 'NASDAQ', 'ARCA', 'IEX', 'CBOE BZX', 'Liquidnet'];
const TRADERS: readonly PersonRef[] = [{ id: 'u-jordan', name: 'Jordan Patel' }];
const COMPLIANCE: PersonRef = { id: 'u-sam', name: 'Sam Rivera' };
/** How often working orders get a chance to (partially) fill. */
const EXECUTION_TICK_MS = 2_500;
/** Seeded orders are spread this far apart through the morning. */
const SEED_SPACING_MS = 9 * 60_000;

/**
 * Order lifecycle and the simulated executions behind it.
 *
 * State machine: created orders start as NEW, or PENDING_APPROVAL when the
 * pre-trade check warns; approval (by someone other than the creator: four
 * eyes) returns them to NEW; routing makes them WORKING, fills move them
 * through PARTIALLY_FILLED to FILLED. CANCELLED and REJECTED are terminal
 * side exits. Every transition is published on the event hub.
 */
export class OrderBook {
  private readonly orders = new Map<string, Order>();
  private sequence = 24100;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly book: PortfolioBook,
    private readonly market: MarketSimulator,
    private readonly compliance: ComplianceEngine,
    private readonly hub: EventHub,
    private readonly random: Random,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.simulateExecutions(), EXECUTION_TICK_MS);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  list(filter: (order: Order) => boolean = () => true): Order[] {
    return [...this.orders.values()]
      .filter(filter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): Order {
    const order = this.orders.get(id);
    if (!order) throw notFound(`Order ${id}`);
    return order;
  }

  create(draft: OrderDraft, by: PersonRef, createdAt = new Date()): Order {
    const security = getSecurity(draft.symbol);
    if (!security)
      throw validation(`Unknown security ${draft.symbol}.`, [
        { path: 'symbol', message: 'Unknown security' },
      ]);
    if (!this.book.exists(draft.portfolioId)) throw notFound(`Portfolio ${draft.portfolioId}`);
    if (
      draft.side === 'SELL' &&
      this.book.positionQuantity(draft.portfolioId, security.symbol) < draft.quantity
    ) {
      throw validation(
        'Cannot sell more than the current position (short selling is not permitted).',
        [
          {
            path: 'quantity',
            message: `Position is ${this.book.positionQuantity(draft.portfolioId, security.symbol)} shares`,
          },
        ],
      );
    }
    const check = this.compliance.check(draft);
    if (check.outcome === 'FAIL') {
      throw new DomainError(
        422,
        ProblemType.ComplianceBlocked,
        'Blocked by compliance',
        'The order breaches a hard compliance rule and cannot be submitted.',
        {
          compliance: check,
        },
      );
    }
    const price = referencePrice(draft, this.market.lastPrice(security.symbol));
    const timestamp = createdAt.toISOString();
    const order: Order = {
      id: `ORD-${(this.sequence += 1)}`,
      portfolioId: draft.portfolioId,
      portfolioName: this.book.name(draft.portfolioId),
      symbol: security.symbol,
      securityName: security.name,
      side: draft.side,
      quantity: draft.quantity,
      orderType: draft.orderType,
      limitPrice: draft.orderType === 'LIMIT' ? draft.limitPrice : null,
      timeInForce: draft.timeInForce,
      status: check.requiresApproval ? 'PENDING_APPROVAL' : 'NEW',
      filledQuantity: 0,
      averageFillPrice: null,
      estimatedNotional: round(price * draft.quantity),
      createdBy: by,
      approvedBy: null,
      routedBy: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      compliance: check,
      rationale: draft.rationale,
      fills: [],
    };
    this.orders.set(order.id, order);
    this.hub.publish({ type: 'order.created', order });
    if (check.requiresApproval) {
      const alert = this.compliance.raiseAlert({
        orderId: order.id,
        portfolioId: order.portfolioId,
        symbol: order.symbol,
        check,
        raisedBy: by,
        raisedAt: timestamp,
      });
      this.hub.publish({ type: 'alert.raised', alert });
    }
    return order;
  }

  approve(id: string, by: PersonRef, comment: string): Order {
    const order = this.get(id);
    if (order.status !== 'PENDING_APPROVAL')
      throw conflict(`Order ${id} is ${order.status}, not pending approval.`);
    if (order.createdBy.id === by.id)
      throw forbidden('Four-eyes principle: you cannot approve your own order.');
    const updated = this.update(order, { status: 'NEW', approvedBy: by });
    const alert = this.compliance.resolveForOrder(id, 'APPROVED', by, comment);
    if (alert) this.hub.publish({ type: 'alert.updated', alert });
    return updated;
  }

  reject(id: string, by: PersonRef, comment: string): Order {
    const order = this.get(id);
    if (order.status !== 'PENDING_APPROVAL')
      throw conflict(`Order ${id} is ${order.status}, not pending approval.`);
    const updated = this.update(order, { status: 'REJECTED' });
    const alert = this.compliance.resolveForOrder(id, 'REJECTED', by, comment);
    if (alert) this.hub.publish({ type: 'alert.updated', alert });
    return updated;
  }

  route(id: string, by: PersonRef): Order {
    const order = this.get(id);
    if (order.status !== 'NEW')
      throw conflict(`Only NEW orders can be routed; ${id} is ${order.status}.`);
    return this.update(order, { status: 'WORKING', routedBy: by });
  }

  cancel(id: string, by: PersonRef, canCancelAny: boolean): Order {
    const order = this.get(id);
    if (TERMINAL_ORDER_STATUSES.includes(order.status))
      throw conflict(`Order ${id} is already ${order.status}.`);
    if (!canCancelAny && order.createdBy.id !== by.id)
      throw forbidden('You can only cancel orders you created.');
    const updated = this.update(order, { status: 'CANCELLED' });
    if (order.status === 'PENDING_APPROVAL') {
      const alert = this.compliance.resolveForOrder(
        id,
        'REJECTED',
        by,
        'Order cancelled by originator.',
      );
      if (alert) this.hub.publish({ type: 'alert.updated', alert });
    }
    return updated;
  }

  private update(order: Order, changes: Partial<Order>, at = new Date()): Order {
    const updated: Order = { ...order, ...changes, updatedAt: at.toISOString() };
    this.orders.set(order.id, updated);
    this.hub.publish({ type: 'order.updated', order: updated, previousStatus: order.status });
    return updated;
  }

  private simulateExecutions(): void {
    for (const order of this.orders.values()) {
      if (order.status !== 'WORKING' && order.status !== 'PARTIALLY_FILLED') continue;
      if (this.random.next() > 0.55) continue;
      const last = this.market.lastPrice(order.symbol);
      if (order.orderType === 'LIMIT' && order.limitPrice !== null) {
        const marketable =
          order.side === 'BUY'
            ? last <= order.limitPrice * 1.004
            : last >= order.limitPrice * 0.996;
        if (!marketable) continue;
      }
      this.executeChunk(order, last);
    }
  }

  private executeChunk(order: Order, last: number, at = new Date(), quantity?: number): Order {
    const remaining = order.quantity - order.filledQuantity;
    const chunk =
      quantity ??
      Math.max(1, Math.min(remaining, Math.round(remaining * this.random.between(0.18, 0.5))));
    const slippage = last * this.random.between(-0.0006, 0.0006);
    let price = round(last + slippage, 2);
    if (order.orderType === 'LIMIT' && order.limitPrice !== null) {
      price =
        order.side === 'BUY'
          ? Math.min(price, order.limitPrice)
          : Math.max(price, order.limitPrice);
    }
    const fill: Fill = {
      id: `${order.id}-F${order.fills.length + 1}`,
      quantity: chunk,
      price,
      venue: this.random.pick(VENUES),
      timestamp: at.toISOString(),
    };
    const filledQuantity = order.filledQuantity + chunk;
    const averageFillPrice = round(
      ((order.averageFillPrice ?? 0) * order.filledQuantity + price * chunk) / filledQuantity,
      4,
    );
    const status: OrderStatus = filledQuantity >= order.quantity ? 'FILLED' : 'PARTIALLY_FILLED';
    const updated = this.update(
      order,
      { filledQuantity, averageFillPrice, status, fills: [...order.fills, fill] },
      at,
    );
    this.book.applyFill(order.portfolioId, order.symbol, order.side, chunk, price);
    return updated;
  }

  /** Seeds a realistic blotter: a trading day already in progress. */
  seed(): void {
    const PMS: readonly PersonRef[] = [
      { id: 'u-alex', name: 'Alex Morgan' },
      { id: 'u-morgan', name: 'Morgan Blake' },
      { id: 'u-priya', name: 'Priya Shah' },
    ];
    const pmFor = (portfolioId: string) =>
      portfolioId === 'TEC' ? PMS[1]! : portfolioId === 'MAB' ? PMS[2]! : PMS[0]!;
    const start = Date.now() - SEED_PLAN.length * SEED_SPACING_MS;
    SEED_PLAN.forEach((item, index) => {
      const createdAt = new Date(start + index * SEED_SPACING_MS + this.random.int(0, 300_000));
      const pm = pmFor(item.portfolioId);
      const last = this.market.lastPrice(item.symbol);
      const limitPrice = item.limit ? round(last * (item.side === 'BUY' ? 1.003 : 0.997), 2) : null;
      let order: Order;
      try {
        order = this.create(
          {
            portfolioId: item.portfolioId,
            symbol: item.symbol,
            side: item.side,
            quantity: item.quantity,
            orderType: item.limit ? 'LIMIT' : 'MARKET',
            limitPrice,
            timeInForce: 'DAY',
            rationale: null,
          },
          pm,
          createdAt,
        );
      } catch (error) {
        // A seed row that trips a hard rule is skipped, visibly, rather than aborting the seed.
        console.warn(`seed: skipped ${item.side} ${item.symbol} for ${item.portfolioId}:`, error);
        return;
      }
      const at = (minutes: number) => new Date(createdAt.getTime() + minutes * 60_000);
      const set = (changes: Partial<Order>) => {
        order = { ...order, ...changes };
        this.orders.set(order.id, order);
      };
      if (order.status === 'PENDING_APPROVAL' && item.target !== 'PENDING_APPROVAL') {
        set({ status: 'NEW', approvedBy: COMPLIANCE });
        this.compliance.resolveForOrder(
          order.id,
          'APPROVED',
          COMPLIANCE,
          'Within mandate; approved on review.',
        );
      }
      if (item.target === 'CANCELLED') {
        set({ status: 'CANCELLED', updatedAt: at(4).toISOString() });
        return;
      }
      if (['WORKING', 'PARTIALLY_FILLED', 'FILLED'].includes(item.target)) {
        set({ status: 'WORKING', routedBy: TRADERS[0]!, updatedAt: at(2).toISOString() });
        if (item.target === 'WORKING') return;
        const fills = item.target === 'FILLED' ? this.random.int(2, 4) : 1;
        for (let i = 0; i < fills; i += 1) {
          const remaining = order.quantity - order.filledQuantity;
          const isLast = item.target === 'FILLED' && i === fills - 1;
          const quantity = isLast
            ? remaining
            : Math.max(1, Math.round(remaining * this.random.between(0.25, 0.45)));
          order = this.executeChunk(
            order,
            this.market.lastPrice(order.symbol),
            at(3 + i * 2),
            quantity,
          );
        }
      }
    });
  }
}
