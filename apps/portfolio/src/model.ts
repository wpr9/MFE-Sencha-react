import type { PortfolioSummary } from '@meridian/contracts';
import type { Tone } from '@meridian/ui';

/** `null` when the BFF withholds compliance data (the user lacks `compliance:read`). */
export function complianceChip(
  portfolio: Pick<PortfolioSummary, 'complianceStatus' | 'openAlerts'>,
): { tone: Tone; label: string } | null {
  if (portfolio.complianceStatus === null || portfolio.openAlerts === null) return null;
  if (portfolio.complianceStatus === 'breach') return { tone: 'error', label: 'Breach' };
  if (portfolio.openAlerts > 0)
    return {
      tone: 'warning',
      label: `${portfolio.openAlerts} alert${portfolio.openAlerts > 1 ? 's' : ''}`,
    };
  if (portfolio.complianceStatus === 'warning') return { tone: 'warning', label: 'Near limit' };
  return { tone: 'success', label: 'Compliant' };
}

/** NAV-weighted aggregates across portfolios. */
export function totals(portfolios: readonly PortfolioSummary[]) {
  const nav = portfolios.reduce((sum, p) => sum + p.nav, 0);
  const dayPnl = portfolios.reduce((sum, p) => sum + p.dayPnl, 0);
  const weight = (pick: (p: PortfolioSummary) => number) =>
    nav ? portfolios.reduce((sum, p) => sum + pick(p) * p.nav, 0) / nav : 0;
  return {
    nav,
    dayPnl,
    dayPnlPercent: nav ? (dayPnl / (nav - dayPnl)) * 100 : 0,
    ytd: weight((p) => p.ytdReturnPercent),
    benchmarkYtd: weight((p) => p.benchmarkYtdReturnPercent),
    alerts: portfolios.reduce((sum, p) => sum + (p.openAlerts ?? 0), 0),
  };
}
