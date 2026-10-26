import {
  PerformanceSeriesSchema,
  PortfolioDetailSchema,
  PortfolioSummarySchema,
  apiPaths,
  type PerformanceRange,
} from '@meridian/contracts';
import { useHost, useHostEvent } from '@meridian/react-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/** Query keys, so live invalidation and the hooks agree on them. */
const portfolioKeys = {
  all: ['portfolios'] as const,
  list: () => [...portfolioKeys.all, 'list'] as const,
  detail: (id: string) => [...portfolioKeys.all, 'detail', id] as const,
  performance: (id: string, range: PerformanceRange) =>
    [...portfolioKeys.all, 'performance', id, range] as const,
};

/** Entitled portfolios with their summaries; polled as a fallback to server push. */
export function usePortfolioList() {
  const { http } = useHost();
  return useQuery({
    queryKey: portfolioKeys.list(),
    queryFn: ({ signal }) =>
      http.get(apiPaths.portfolios(), { signal, parser: PortfolioSummarySchema.array() }),
    refetchInterval: 30_000,
  });
}

/** One portfolio with holdings, exposures and risk. */
export function usePortfolio(portfolioId: string) {
  const { http } = useHost();
  return useQuery({
    queryKey: portfolioKeys.detail(portfolioId),
    queryFn: ({ signal }) =>
      http.get(apiPaths.portfolio(portfolioId), { signal, parser: PortfolioDetailSchema }),
    refetchInterval: 30_000,
  });
}

/** Cumulative performance vs benchmark for a range; the previous range stays visible while loading. */
export function usePerformance(portfolioId: string, range: PerformanceRange) {
  const { http } = useHost();
  return useQuery({
    queryKey: portfolioKeys.performance(portfolioId, range),
    queryFn: ({ signal }) =>
      http.get(apiPaths.performance(portfolioId), {
        signal,
        query: { range },
        parser: PerformanceSeriesSchema,
      }),
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });
}

/**
 * Server push -> cache invalidation: a fill (`portfolio.changed`) or a
 * compliance alert raised/resolved for a portfolio changes what its views
 * show, so every view showing it refetches - no waiting for the poll.
 */
export function useLivePortfolioInvalidation() {
  const queryClient = useQueryClient();
  const refresh = (portfolioId: string) => {
    void queryClient.invalidateQueries({ queryKey: portfolioKeys.detail(portfolioId) });
    void queryClient.invalidateQueries({ queryKey: portfolioKeys.list() });
  };
  useHostEvent('portfolio.changed', ({ portfolioId }) => refresh(portfolioId));
  useHostEvent('compliance.alert.raised', ({ alert }) => refresh(alert.portfolioId));
  useHostEvent('compliance.alert.updated', ({ alert }) => refresh(alert.portfolioId));
}
