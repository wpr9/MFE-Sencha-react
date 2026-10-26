import type {
  Exposure,
  Holding,
  PerformanceRange,
  PerformanceSeries,
  PersonRef,
  PortfolioDetail,
  PortfolioSummary,
  RiskMetrics,
} from '@meridian/contracts';
import type { MarketSimulator } from './market';
import { DEFINITIONS, type PortfolioDefinition } from './portfolio-definitions';
import { round, type Random } from './random';
import { getSecurity } from './securities';

/** Trading days of generated history (about one year). */
const HISTORY_DAYS = 260;
const TRADING_DAYS_PER_YEAR = 252;
/** Risk-free rate used by the Sharpe ratio. */
const RISK_FREE_RATE = 0.04;
/** One-tailed 95% z-score for the parametric VaR. */
const VAR_95_Z = 1.645;

interface Position {
  quantity: number;
  averageCost: number;
  targetWeightPercent: number;
}

interface HistoryPoint {
  readonly date: string;
  readonly portfolio: number;
  readonly benchmark: number;
}

/** Everything about the history that does not change with today's prices. */
interface HistoryStatistics {
  readonly ytd: { readonly portfolio: number; readonly benchmark: number };
  readonly risk: Omit<RiskMetrics, 'valueAtRisk95'>;
  /** Daily standard deviation of portfolio returns; VaR scales it by NAV at request time. */
  readonly dailyStd: number;
}

interface PortfolioState {
  readonly definition: PortfolioDefinition;
  readonly positions: Map<string, Position>;
  cash: number;
  /** Cumulative growth index (1.0 = 1Y ago) for portfolio and benchmark. */
  readonly history: readonly HistoryPoint[];
  readonly statistics: HistoryStatistics;
}

function businessDaysBack(count: number): string[] {
  const days: string[] = [];
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  while (days.length < count) {
    date.setUTCDate(date.getUTCDate() - 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) days.unshift(date.toISOString().slice(0, 10));
  }
  return days;
}

/** Shifts log-returns in [from, to) by a constant so they compound to `growth`. */
function bridge(logReturns: number[], from: number, to: number, growth: number): void {
  if (to <= from) return;
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += logReturns[i] ?? 0;
  const correction = (Math.log(1 + growth) - sum) / (to - from);
  for (let i = from; i < to; i += 1) logReturns[i] = (logReturns[i] ?? 0) + correction;
}

/**
 * Correlated daily log-returns: benchmark ~ market factor, portfolio =
 * beta * market + noise. Each segment (prior year, year-to-date) is then
 * bridged to a calibrated total return, keeping realistic volatility while
 * avoiding implausible random outcomes in a demo.
 */
function simulateHistory(
  definition: PortfolioDefinition,
  dates: readonly string[],
  random: Random,
): HistoryPoint[] {
  const dailyVol = definition.annualVol / Math.sqrt(TRADING_DAYS_PER_YEAR);
  const portfolioReturns: number[] = [];
  const benchmarkReturns: number[] = [];
  for (let i = 0; i < dates.length; i += 1) {
    const marketReturn = random.normal() * (dailyVol / Math.max(definition.beta, 0.5));
    benchmarkReturns.push(marketReturn);
    portfolioReturns.push(definition.beta * marketReturn + random.normal() * dailyVol * 0.35);
  }
  const ytdStart = Math.max(
    1,
    dates.findIndex((date) => date.startsWith(String(new Date().getUTCFullYear()))),
  );
  const priorGrowth = (definition.annualDrift * ytdStart) / TRADING_DAYS_PER_YEAR;
  bridge(portfolioReturns, 0, ytdStart, priorGrowth);
  bridge(benchmarkReturns, 0, ytdStart, priorGrowth * 0.9);
  bridge(portfolioReturns, ytdStart, dates.length, definition.ytdTarget);
  bridge(benchmarkReturns, ytdStart, dates.length, definition.benchmarkYtdTarget);
  const history: HistoryPoint[] = [];
  let portfolioIndex = 1;
  let benchmarkIndex = 1;
  dates.forEach((date, i) => {
    portfolioIndex *= Math.exp(portfolioReturns[i] ?? 0);
    benchmarkIndex *= Math.exp(benchmarkReturns[i] ?? 0);
    history.push({ date, portfolio: portfolioIndex, benchmark: benchmarkIndex });
  });
  return history;
}

function sliceHistory(history: readonly HistoryPoint[], range: PerformanceRange) {
  const days: Record<Exclude<PerformanceRange, 'YTD'>, number> = {
    '1M': 21,
    '3M': 63,
    '6M': 126,
    '1Y': 252,
  };
  if (range === 'YTD') {
    const year = new Date().getUTCFullYear();
    const start = history.findIndex((point) => point.date.startsWith(String(year)));
    return history.slice(Math.max(0, start - 1));
  }
  return history.slice(-days[range] - 1);
}

function rangeReturn(history: readonly HistoryPoint[], range: PerformanceRange) {
  const points = sliceHistory(history, range);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return { portfolio: 0, benchmark: 0 };
  return {
    portfolio: (last.portfolio / first.portfolio - 1) * 100,
    benchmark: (last.benchmark / first.benchmark - 1) * 100,
  };
}

/** Computed once per portfolio: the history is fixed after construction. */
function historyStatistics(history: readonly HistoryPoint[]): HistoryStatistics {
  const returns: { p: number; b: number }[] = [];
  for (let i = 1; i < history.length; i += 1) {
    const previous = history[i - 1];
    const current = history[i];
    if (!previous || !current) continue;
    returns.push({
      p: current.portfolio / previous.portfolio - 1,
      b: current.benchmark / previous.benchmark - 1,
    });
  }
  const mean = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const variance = (values: number[], m: number) => mean(values.map((v) => (v - m) ** 2));
  const p = returns.map((r) => r.p);
  const b = returns.map((r) => r.b);
  const meanP = mean(p);
  const meanB = mean(b);
  const covariance = mean(returns.map((r) => (r.p - meanP) * (r.b - meanB)));
  const dailyStd = Math.sqrt(variance(p, meanP));
  const active = returns.map((r) => r.p - r.b);
  const stdActive = Math.sqrt(variance(active, mean(active)));
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of history) {
    peak = Math.max(peak, point.portfolio);
    maxDrawdown = Math.min(maxDrawdown, point.portfolio / peak - 1);
  }
  const annualVol = dailyStd * Math.sqrt(TRADING_DAYS_PER_YEAR);
  return {
    ytd: rangeReturn(history, 'YTD'),
    dailyStd,
    risk: {
      beta: round(covariance / variance(b, meanB), 2),
      annualizedVolatilityPercent: round(annualVol * 100, 2),
      trackingErrorPercent: round(stdActive * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100, 2),
      sharpeRatio: round((meanP * TRADING_DAYS_PER_YEAR - RISK_FREE_RATE) / annualVol, 2),
      maxDrawdownPercent: round(maxDrawdown * 100, 2),
    },
  };
}

/** The list-row view of a portfolio: a detail without holdings, exposures and risk. */
export function toSummary(detail: PortfolioDetail): PortfolioSummary {
  const { holdings: _holdings, exposures: _exposures, risk: _risk, ...summary } = detail;
  return summary;
}

/**
 * Positions, cash and the generated history of every fund, valued at the
 * simulator's latest prices on each request. Fills mutate positions and cash
 * and notify listeners (the event hub), which is how portfolio views refresh.
 */
export class PortfolioBook {
  private readonly portfolios = new Map<string, PortfolioState>();
  private readonly changeListeners = new Set<(portfolioId: string) => void>();

  constructor(
    private readonly market: MarketSimulator,
    random: Random,
  ) {
    const dates = businessDaysBack(HISTORY_DAYS);
    for (const definition of DEFINITIONS) {
      const positions = new Map<string, Position>();
      const investable = definition.targetNav * (1 - definition.cashWeight / 100);
      const weightSum = Object.values(definition.weights).reduce((sum, weight) => sum + weight, 0);
      for (const [symbol, weight] of Object.entries(definition.weights)) {
        const price = market.lastPrice(symbol);
        const quantity = Math.round((investable * (weight / weightSum)) / price);
        positions.set(symbol, {
          quantity,
          averageCost: round(price * random.between(0.62, 1.08), 2),
          targetWeightPercent: round((weight / weightSum) * (100 - definition.cashWeight), 2),
        });
      }
      const history = simulateHistory(definition, dates, random);
      this.portfolios.set(definition.id, {
        definition,
        positions,
        cash: definition.targetNav * (definition.cashWeight / 100),
        history,
        statistics: historyStatistics(history),
      });
    }
  }

  ids(): string[] {
    return [...this.portfolios.keys()];
  }

  exists(id: string): boolean {
    return this.portfolios.has(id);
  }

  name(id: string): string {
    return this.portfolios.get(id)?.definition.name ?? id;
  }

  onChange(listener: (portfolioId: string) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  positionQuantity(portfolioId: string, symbol: string): number {
    return this.portfolios.get(portfolioId)?.positions.get(symbol)?.quantity ?? 0;
  }

  /** Applies an execution to positions and cash (average cost on buys, realised on sells). */
  applyFill(
    portfolioId: string,
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
  ): void {
    const state = this.portfolios.get(portfolioId);
    if (!state) return;
    const position = state.positions.get(symbol) ?? {
      quantity: 0,
      averageCost: price,
      targetWeightPercent: 0,
    };
    if (side === 'BUY') {
      const cost = position.averageCost * position.quantity + price * quantity;
      position.quantity += quantity;
      position.averageCost = round(cost / position.quantity, 4);
      state.cash -= price * quantity;
    } else {
      // Never credit cash for shares that are not there: the order book reserves open sells,
      // and the ledger stays honest even if that guard were bypassed.
      const sold = Math.min(quantity, position.quantity);
      position.quantity -= sold;
      state.cash += price * sold;
    }
    if (position.quantity === 0) state.positions.delete(symbol);
    else state.positions.set(symbol, position);
    for (const listener of this.changeListeners) listener(portfolioId);
  }

  /**
   * Values a portfolio at the latest prices. Compliance posture is not known
   * here (the engine depends on this book): callers overlay it.
   */
  detail(id: string): PortfolioDetail | undefined {
    const state = this.portfolios.get(id);
    if (!state) return undefined;
    const { definition } = state;
    let marketValueTotal = 0;
    let dayPnl = 0;
    const rows: Omit<Holding, 'weightPercent'>[] = [];
    for (const [symbol, position] of state.positions) {
      const security = getSecurity(symbol);
      if (!security) continue;
      const price = this.market.lastPrice(symbol);
      const previousClose = this.market.previousClose(symbol);
      const marketValue = position.quantity * price;
      const dayChange = position.quantity * (price - previousClose);
      marketValueTotal += marketValue;
      dayPnl += dayChange;
      rows.push({
        symbol,
        name: security.name,
        assetClass: security.assetClass,
        sector: security.sector,
        country: security.country,
        quantity: position.quantity,
        averageCost: round(position.averageCost, 2),
        price,
        marketValue: round(marketValue),
        targetWeightPercent: position.targetWeightPercent,
        dayChange: round(dayChange),
        dayChangePercent: round(((price - previousClose) / previousClose) * 100, 2),
        unrealizedPnl: round(marketValue - position.quantity * position.averageCost),
        unrealizedPnlPercent: round(
          ((price - position.averageCost) / position.averageCost) * 100,
          2,
        ),
      });
    }
    const nav = marketValueTotal + state.cash;
    const holdings: Holding[] = rows
      .map((row) => ({ ...row, weightPercent: round((row.marketValue / nav) * 100, 2) }))
      .sort((a, b) => b.marketValue - a.marketValue);

    const { ytd, risk, dailyStd } = state.statistics;
    const dayPnlPercent = (dayPnl / (nav - dayPnl)) * 100;
    return {
      id: definition.id,
      name: definition.name,
      strategy: definition.strategy,
      baseCurrency: 'USD',
      benchmark: definition.benchmark,
      manager: definition.manager,
      inceptionDate: definition.inceptionDate,
      nav: round(nav),
      cash: round(state.cash),
      dayPnl: round(dayPnl),
      dayPnlPercent: round(dayPnlPercent, 2),
      ytdReturnPercent: round(ytd.portfolio + dayPnlPercent, 2),
      benchmarkYtdReturnPercent: round(ytd.benchmark, 2),
      holdingsCount: holdings.length,
      complianceStatus: 'ok',
      openAlerts: 0,
      holdings,
      exposures: {
        sector: this.groupExposure(holdings, 'sector', state.cash, nav),
        assetClass: this.groupExposure(holdings, 'assetClass', state.cash, nav),
        country: this.groupExposure(holdings, 'country', state.cash, nav),
      },
      risk: { ...risk, valueAtRisk95: round(VAR_95_Z * dailyStd * nav) },
    };
  }

  performance(id: string, range: PerformanceRange): PerformanceSeries | undefined {
    const state = this.portfolios.get(id);
    if (!state) return undefined;
    const points = sliceHistory(state.history, range);
    const first = points[0];
    if (!first) return undefined;
    const series = points.map((point) => ({
      date: point.date,
      portfolio: round((point.portfolio / first.portfolio - 1) * 100, 3),
      benchmark: round((point.benchmark / first.benchmark - 1) * 100, 3),
    }));
    const last = series[series.length - 1] ?? { portfolio: 0, benchmark: 0 };
    return {
      portfolioId: id,
      range,
      benchmark: state.definition.benchmark,
      points: series,
      portfolioReturnPercent: last.portfolio,
      benchmarkReturnPercent: last.benchmark,
    };
  }

  private groupExposure(
    holdings: Holding[],
    key: 'sector' | 'assetClass' | 'country',
    cash: number,
    nav: number,
  ): Exposure[] {
    const totals = new Map<string, number>();
    for (const holding of holdings)
      totals.set(holding[key], (totals.get(holding[key]) ?? 0) + holding.marketValue);
    totals.set('Cash', (totals.get('Cash') ?? 0) + cash);
    return [...totals.entries()]
      .map(([exposureKey, value]) => ({
        key: exposureKey,
        weightPercent: round((value / nav) * 100, 2),
      }))
      .sort((a, b) => b.weightPercent - a.weightPercent);
  }
}
