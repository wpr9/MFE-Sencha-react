import type { PortfolioSummary } from '@meridian/contracts';
import { useFormatters } from '@meridian/react-sdk';
import { StatTile } from '@meridian/ui';
import { totals } from '../model';

/** The three NAV-weighted totals shown above any list of portfolios (page and widget). */
export function PortfolioTotals({
  portfolios,
  loading,
}: {
  readonly portfolios: readonly PortfolioSummary[];
  readonly loading: boolean;
}) {
  const f = useFormatters();
  const sum = totals(portfolios);
  return (
    <>
      <StatTile
        hero
        label="Assets under management"
        value={f.currency(sum.nav, true)}
        loading={loading}
      />
      <StatTile
        label="Day P&L"
        value={f.signedCurrency(sum.dayPnl, true)}
        delta={f.signedPercent(sum.dayPnlPercent)}
        deltaValue={sum.dayPnl}
        deltaLabel="vs prior close"
        loading={loading}
      />
      <StatTile
        label="YTD return (NAV-weighted)"
        value={f.signedPercent(sum.ytd, 1)}
        delta={f.signedPercent(sum.ytd - sum.benchmarkYtd, 1)}
        deltaValue={sum.ytd - sum.benchmarkYtd}
        deltaLabel="vs benchmarks"
        loading={loading}
      />
    </>
  );
}
