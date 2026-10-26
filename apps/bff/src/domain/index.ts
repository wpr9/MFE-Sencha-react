import { ComplianceEngine } from './compliance';
import { EventHub } from './events';
import { MarketSimulator } from './market';
import { OrderBook } from './orders';
import { PortfolioBook } from './portfolios';
import { createRandom } from './random';

export type Domain = ReturnType<typeof createDomain>;

/** Wires the simulated back-office: market -> portfolios -> compliance -> orders -> events. */
export function createDomain(options: { seed: number; tickMs: number }) {
  const random = createRandom(options.seed);
  const hub = new EventHub();
  const market = new MarketSimulator(random, options.tickMs);
  const book = new PortfolioBook(market, random);
  const compliance = new ComplianceEngine(book, market);
  const orders = new OrderBook(book, market, compliance, hub, random);
  // Seed before wiring the hub: the seeded history must not be replayed to clients as live events.
  orders.seed();

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
