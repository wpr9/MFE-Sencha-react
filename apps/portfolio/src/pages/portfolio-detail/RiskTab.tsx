import { Box, Chip, Stack, Typography } from '@mui/material';
import type { PortfolioDetail } from '@meridian/contracts';
import { useFormatters } from '@meridian/react-sdk';
import { SectionCard, StatTile } from '@meridian/ui';

/** Risk analytics from one year of daily returns (behind a feature flag). */
export function RiskTab({ portfolio }: { readonly portfolio: PortfolioDetail }) {
  const f = useFormatters();
  const { risk } = portfolio;
  const items = [
    {
      label: 'Beta vs benchmark',
      value: f.number(risk.beta, 2),
      note: 'Sensitivity to benchmark moves (1.0 = moves with the market).',
    },
    {
      label: 'Volatility (annualised)',
      value: f.percent(risk.annualizedVolatilityPercent, 1),
      note: 'Standard deviation of daily returns, annualised.',
    },
    {
      label: 'Value at risk (1-day, 95%)',
      value: f.currency(risk.valueAtRisk95, true),
      note: 'Loss not expected to be exceeded on 19 of 20 days.',
    },
    {
      label: 'Tracking error',
      value: f.percent(risk.trackingErrorPercent, 1),
      note: 'Volatility of returns relative to the benchmark.',
    },
    {
      label: 'Sharpe ratio',
      value: f.number(risk.sharpeRatio, 2),
      note: 'Excess return per unit of risk (4% risk-free).',
    },
    {
      label: 'Max drawdown (1Y)',
      value: f.percent(risk.maxDrawdownPercent, 1),
      note: 'Largest peak-to-trough decline over the last year.',
    },
  ];
  return (
    <SectionCard
      title="Risk analytics"
      subtitle={
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <span>Computed from one year of daily returns</span>
          <Chip size="small" label="Beta feature" />
        </Stack>
      }
    >
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        {items.map((item) => (
          <Box key={item.label}>
            <StatTile label={item.label} value={item.value} />
            <Typography variant="body2" color="text.secondary">
              {item.note}
            </Typography>
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}
