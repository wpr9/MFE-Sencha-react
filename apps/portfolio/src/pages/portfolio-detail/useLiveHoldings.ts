import type { Holding, PortfolioDetail } from '@meridian/contracts';
import { useQuotes } from '@meridian/react-sdk';
import { useMemo } from 'react';

/** A holding re-valued at the latest quote. */
export interface LiveHolding extends Holding {
  readonly livePrice: number;
  readonly liveValue: number;
  readonly liveWeight: number;
  readonly liveDayPercent: number;
  readonly livePnl: number;
}

export interface LiveValuation {
  readonly rows: LiveHolding[];
  readonly nav: number;
  readonly dayPnl: number;
}

const EMPTY: LiveValuation = { rows: [], nav: 0, dayPnl: 0 };

/** Re-values holdings on every tick from the shared market-data stream. */
export function useLiveHoldings(portfolio: PortfolioDetail | undefined): LiveValuation {
  const quotes = useQuotes(
    useMemo(() => portfolio?.holdings.map((h) => h.symbol) ?? [], [portfolio]),
  );
  return useMemo(() => {
    if (!portfolio) return EMPTY;
    let invested = 0;
    let dayPnl = 0;
    const partial = portfolio.holdings.map((holding) => {
      const quote = quotes.get(holding.symbol);
      const price = quote?.last ?? holding.price;
      const value = holding.quantity * price;
      invested += value;
      dayPnl += quote ? holding.quantity * quote.change : holding.dayChange;
      return {
        holding,
        price,
        value,
        dayPercent: quote?.changePercent ?? holding.dayChangePercent,
      };
    });
    const nav = invested + portfolio.cash;
    const rows = partial.map(({ holding, price, value, dayPercent }) => ({
      ...holding,
      livePrice: price,
      liveValue: value,
      liveWeight: nav ? (value / nav) * 100 : 0, // an empty book has no weights, not NaN ones
      liveDayPercent: dayPercent,
      livePnl: value - holding.quantity * holding.averageCost,
    }));
    return { rows, nav, dayPnl };
  }, [portfolio, quotes]);
}
