import { ComplianceEngine } from './compliance';
import { EventHub } from './events';
import { MarketSimulator } from './market';
import { OrderBook, type DomainLogger } from './orders';
import { PortfolioBook } from './portfolios';
import { createRandom } from './random';

export type Domain = ReturnType<typeof createDomain>;

export interface DomainOptions {
  readonly seed: number;
  readonly tickMs: number;
  /** Structured logger (pino); defaults to the console. */
  readonly log?: DomainLogger;
}

/** Wires the simulated back-office: market -> portfolios -> compliance -> orders -> events. */
export function createDomain(options: DomainOptions) {
  const random = createRandom(options.seed);
  const hub = new EventHub();
  const market = new MarketSimulator(random, options.tickMs);
  const book = new PortfolioBook(market, random);
  const compliance = new ComplianceEngine(book, market);
  const orders = new OrderBook(book, market, compliance, hub, random, options.log);
  // Seeding publishes exactly like live trading would; the history is then dropped from the
  // replay buffer so a reconnecting client never receives this morning's orders as live events.
  orders.seed();
  hub.reset();

  market.onTick((quotes) => hub.publish({ type: 'quotes', quotes }));
  book.onChange((portfolioId) =>
    hub.publish({ type: 'portfolio.changed', portfolioId, reason: 'fill' }),
  );

  return {
    hub,
    market,
    book,
    compliance,
    orders,
    start() {
      market.start();
      orders.start();
    },
    stop() {
      market.stop();
      orders.stop();
    },
  };
}
