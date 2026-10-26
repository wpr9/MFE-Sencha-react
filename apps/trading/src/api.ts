import {
  ComplianceCheckResultSchema,
  OrderSchema,
  PortfolioDetailSchema,
  PortfolioSummarySchema,
  SecuritySchema,
  apiPaths,
  type OrderDraft,
} from '@meridian/contracts';
import { useHost, useHostEvent } from '@meridian/react-sdk';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** The security master (small, static for a session). */
export function useSecurities() {
  const { http } = useHost();
  return useQuery({
    queryKey: ['securities'],
    queryFn: ({ signal }) =>
      http.get(apiPaths.securities(), { signal, parser: SecuritySchema.array() }),
    staleTime: Infinity,
  });
}

/** Portfolios the user is entitled to (ticket's portfolio picker). */
export function usePortfolios() {
  const { http } = useHost();
  return useQuery({
    queryKey: ['portfolios'],
    queryFn: ({ signal }) =>
      http.get(apiPaths.portfolios(), { signal, parser: PortfolioSummarySchema.array() }),
  });
}

/** One portfolio with holdings, for position checks; disabled until a portfolio is chosen. */
export function usePortfolioDetail(portfolioId: string | undefined) {
  const { http } = useHost();
  const queryClient = useQueryClient();
  // Positions change with fills: follow the server push rather than polling.
  useHostEvent('portfolio.changed', (payload) => {
    if (payload.portfolioId === portfolioId)
      void queryClient.invalidateQueries({ queryKey: ['portfolio', portfolioId] });
  });
  return useQuery({
    queryKey: ['portfolio', portfolioId],
    queryFn: portfolioId
      ? ({ signal }) =>
          http.get(apiPaths.portfolio(portfolioId), { signal, parser: PortfolioDetailSchema })
      : skipToken,
  });
}

/** Pre-trade compliance what-if, re-run as the draft changes (debounced by the caller). */
export function useComplianceCheck(draft: OrderDraft | null) {
  const { http } = useHost();
  return useQuery({
    queryKey: ['compliance-check', draft],
    queryFn: ({ signal }) =>
      http.post(apiPaths.complianceCheck(), draft, { signal, parser: ComplianceCheckResultSchema }),
    enabled: draft !== null,
    staleTime: 10_000,
    placeholderData: (previous) => previous,
  });
}

/** Submits an order; the BFF re-runs compliance authoritatively. */
export function useCreateOrder() {
  const { http } = useHost();
  return useMutation({
    mutationFn: (draft: OrderDraft) => http.post(apiPaths.orders(), draft, { parser: OrderSchema }),
  });
}
