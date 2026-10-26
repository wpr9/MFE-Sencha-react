import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { PerformanceRange, PortfolioDetail } from '@meridian/contracts';
import { useFormatters } from '@meridian/react-sdk';
import { ErrorState, FlashValue, SectionCard, StatTile, TrendText } from '@meridian/ui';
import { useMemo, useState } from 'react';
import { usePerformance } from '../../api';
import { AllocationBars, PerformanceChart, RangeToggle } from '../../components/charts';
import type { LiveValuation } from './useLiveHoldings';

/** How many of the largest positions the overview lists. */
const TOP_POSITIONS = 6;
/** Exposure rows shown per allocation dimension. */
const TOP_EXPOSURES = 10;

/** KPIs, performance vs benchmark, allocation and the largest positions. */
export function OverviewTab({
  portfolio,
  live,
}: {
  readonly portfolio: PortfolioDetail;
  readonly live: LiveValuation;
}) {
  const f = useFormatters();
  const [range, setRange] = useState<PerformanceRange>('YTD');
  const [dimension, setDimension] = useState<'sector' | 'assetClass' | 'country'>('sector');
  const performance = usePerformance(portfolio.id, range);
  const dayPercent = (live.dayPnl / (live.nav - live.dayPnl)) * 100;
  const activeReturn = portfolio.ytdReturnPercent - portfolio.benchmarkYtdReturnPercent;
  const top = [...live.rows].sort((a, b) => b.liveValue - a.liveValue).slice(0, TOP_POSITIONS);
  // Memoised so `AllocationBars` (a memo component) keeps the same input across quote ticks.
  const exposures = useMemo(
    () => portfolio.exposures[dimension].slice(0, TOP_EXPOSURES),
    [portfolio.exposures, dimension],
  );
  return (
    <Stack spacing={2}>
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' },
          py: 1,
        }}
      >
        <StatTile hero label="Net asset value" value={f.currency(live.nav, true)} />
        <StatTile
          label="Day P&L"
          value={f.signedCurrency(live.dayPnl, true)}
          delta={f.signedPercent(dayPercent)}
          deltaValue={live.dayPnl}
          deltaLabel="today"
        />
        <StatTile
          label="YTD return"
          value={f.signedPercent(portfolio.ytdReturnPercent, 1)}
          delta={f.signedPercent(activeReturn, 1)}
          deltaValue={activeReturn}
          deltaLabel={`vs ${portfolio.benchmark}`}
        />
        <StatTile
          label="Cash"
          value={f.currency(portfolio.cash, true)}
          delta={f.percent((portfolio.cash / live.nav) * 100, 1)}
          deltaLabel="of NAV"
        />
      </Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' } }}>
        <SectionCard
          title="Performance"
          subtitle="Cumulative return from the start of the period"
          action={<RangeToggle value={range} onChange={setRange} />}
        >
          {performance.isError ? (
            <ErrorState
              compact
              message="Performance is unavailable."
              onRetry={() => void performance.refetch()}
            />
          ) : (
            <PerformanceChart series={performance.data} loading={performance.isFetching} />
          )}
        </SectionCard>
        <SectionCard
          title="Allocation"
          subtitle="Share of NAV"
          action={
            <ToggleButtonGroup
              size="small"
              exclusive
              value={dimension}
              onChange={(_, value: typeof dimension | null) => value && setDimension(value)}
              aria-label="Allocation dimension"
            >
              <ToggleButton value="sector">Sector</ToggleButton>
              <ToggleButton value="assetClass">Asset</ToggleButton>
              <ToggleButton value="country">Country</ToggleButton>
            </ToggleButtonGroup>
          }
        >
          <AllocationBars exposures={exposures} />
        </SectionCard>
      </Box>
      <SectionCard title="Largest positions" subtitle="Live valuation" flush>
        <Box
          component="table"
          aria-label="Largest positions"
          sx={{
            width: '100%',
            borderCollapse: 'collapse',
            '& td, & th': {
              px: 2.5,
              py: 1.25,
              borderTop: 1,
              borderColor: 'divider',
              textAlign: 'left',
            },
            '& th': { typography: 'body2', color: 'text.secondary', fontWeight: 500 },
            '& .num': { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
          }}
        >
          <thead>
            <tr>
              <th scope="col">Security</th>
              <th scope="col" className="num">
                Price
              </th>
              <th scope="col" className="num">
                Today
              </th>
              <th scope="col" className="num">
                Value
              </th>
              <th scope="col" className="num">
                Weight
              </th>
            </tr>
          </thead>
          <tbody>
            {top.map((row) => (
              <tr key={row.symbol}>
                <td>
                  <Typography variant="subtitle2" component="span">
                    {row.symbol}
                  </Typography>{' '}
                  <Typography variant="body1" component="span" color="text.secondary">
                    {row.name}
                  </Typography>
                </td>
                <td className="num">
                  <FlashValue value={row.livePrice}>{f.price(row.livePrice)}</FlashValue>
                </td>
                <td className="num">
                  <TrendText value={row.liveDayPercent}>
                    {f.signedPercent(row.liveDayPercent)}
                  </TrendText>
                </td>
                <td className="num">{f.currency(row.liveValue, true)}</td>
                <td className="num">{f.percent(row.liveWeight, 2)}</td>
              </tr>
            ))}
          </tbody>
        </Box>
      </SectionCard>
    </Stack>
  );
}
