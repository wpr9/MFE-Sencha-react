import type { Quote } from '@meridian/contracts';
import { round, type Random } from './random';
import { SECURITIES, type SecurityDefinition } from './securities';

interface MutableQuote {
  symbol: string;
  last: number;
  open: number;
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  timestamp: number;
  spreadBps: number;
}

/**
 * Geometric Brownian motion price simulator. Time is accelerated so a demo
 * session shows realistic intraday movement within minutes.
 */
export class MarketSimulator {
  private readonly quotes = new Map<string, MutableQuote>();
  /** Recent trade prints per symbol (bounded) for intraday charts. */
  private readonly history = new Map<string, { t: number; price: number }[]>();
  private static readonly HISTORY_LIMIT = 360;
  private readonly listeners = new Set<(quotes: Quote[]) => void>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly random: Random,
    private readonly tickMs: number,
  ) {
    for (const security of SECURITIES) {
      const previousClose = security.basePrice;
      const gap = 1 + random.normal() * security.volatility * 0.02;
      const open = round(previousClose * gap);
      // Pre-roll an intraday path so the first screen is not flat.
      let last = open;
      let high = open;
      let low = open;
      const prints: { t: number; price: number }[] = [];
      const startedAt = Date.now() - 120 * tickMs;
      for (let i = 0; i < 120; i += 1) {
        last = this.step(last, security);
        high = Math.max(high, last);
        low = Math.min(low, last);
        prints.push({ t: startedAt + i * tickMs, price: round(last) });
      }
      this.history.set(security.symbol, prints);
      this.quotes.set(security.symbol, {
        symbol: security.symbol,
        last: round(last),
        open,
        previousClose,
        dayHigh: round(high),
        dayLow: round(low),
        volume: random.int(2_000_000, 40_000_000),
        timestamp: Date.now(),
        spreadBps:
          security.assetClass === 'Equity' ? random.between(1, 4) : random.between(0.5, 1.5),
      });
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  onTick(listener: (quotes: Quote[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getQuote(symbol: string): Quote | undefined {
    const quote = this.quotes.get(symbol);
    return quote ? this.toQuote(quote) : undefined;
  }

  getQuotes(symbols?: readonly string[]): Quote[] {
    const list = symbols?.length
      ? symbols.flatMap((s) => this.quotes.get(s) ?? [])
      : [...this.quotes.values()];
    return list.map((quote) => this.toQuote(quote));
  }

  intraday(symbol: string): { t: string; price: number }[] | undefined {
    return this.history
      .get(symbol)
      ?.map((point) => ({ t: new Date(point.t).toISOString(), price: point.price }));
  }

  lastPrice(symbol: string): number {
    return this.quotes.get(symbol)?.last ?? 0;
  }

  previousClose(symbol: string): number {
    return this.quotes.get(symbol)?.previousClose ?? 0;
  }

  private step(price: number, security: SecurityDefinition): number {
    // Each tick advances the simulation's own clock by 40 s of trading time, whatever
    // MARKET_TICK_MS is: a faster tick means a faster day, not calmer prices.
    const dt = 40 / (252 * 6.5 * 3600);
    const shock = this.random.normal() * security.volatility * Math.sqrt(dt);
    return Math.max(0.5, price * Math.exp(shock - (security.volatility ** 2 * dt) / 2));
  }

  private tick(): void {
    const changed: Quote[] = [];
    const now = Date.now();
    for (const security of SECURITIES) {
      if (this.random.next() > 0.55) continue;
      const quote = this.quotes.get(security.symbol);
      if (!quote) continue;
      quote.last = round(this.step(quote.last, security));
      quote.dayHigh = Math.max(quote.dayHigh, quote.last);
      quote.dayLow = Math.min(quote.dayLow, quote.last);
      quote.volume += this.random.int(500, 25_000);
      quote.timestamp = now;
      const prints = this.history.get(security.symbol);
      if (prints) {
        prints.push({ t: now, price: quote.last });
        if (prints.length > MarketSimulator.HISTORY_LIMIT) prints.shift();
      }
      changed.push(this.toQuote(quote));
    }
    if (changed.length === 0) return;
    for (const listener of this.listeners) listener(changed);
  }

  private toQuote(quote: MutableQuote): Quote {
    const halfSpread = (quote.last * quote.spreadBps) / 20_000;
    const change = quote.last - quote.previousClose;
    return {
      symbol: quote.symbol,
      last: quote.last,
      bid: round(quote.last - halfSpread, 2),
      ask: round(quote.last + halfSpread, 2),
      open: quote.open,
      previousClose: quote.previousClose,
      change: round(change, 2),
      changePercent: round((change / quote.previousClose) * 100, 2),
      dayHigh: quote.dayHigh,
      dayLow: quote.dayLow,
      volume: quote.volume,
      timestamp: new Date(quote.timestamp).toISOString(),
    };
  }
}
