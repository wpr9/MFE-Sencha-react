import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import ShowChartOutlined from '@mui/icons-material/ShowChartOutlined';
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import type { Exposure, PerformanceRange, PerformanceSeries } from '@meridian/contracts';
import { parseDate } from '@meridian/formatting';
import { useFormatters } from '@meridian/react-sdk';
import { TrendText } from '@meridian/ui';
import { memo, useMemo, useState } from 'react';

const RANGES: PerformanceRange[] = ['1M', '3M', '6M', 'YTD', '1Y'];

/** Segmented control for the performance range. */
export function RangeToggle({
  value,
  onChange,
}: {
  readonly value: PerformanceRange;
  readonly onChange: (range: PerformanceRange) => void;
}) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value}
      onChange={(_, next: PerformanceRange | null) => next && onChange(next)}
      aria-label="Performance range"
    >
      {RANGES.map((range) => (
        <ToggleButton key={range} value={range} sx={{ px: 1.5 }}>
          {range}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

function LegendKey({
  color,
  label,
  value,
}: {
  readonly color: string;
  readonly label: string;
  readonly value: number;
}) {
  const f = useFormatters();
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Box sx={{ width: 16, height: 2, borderRadius: 1, bgcolor: color }} aria-hidden />
      <Typography variant="body1" color="text.secondary">
        {label}
      </Typography>
      <TrendText value={value} showIcon={false} sx={{ fontWeight: 500 }}>
        {f.signedPercent(value)}
      </TrendText>
    </Stack>
  );
}

/**
 * Cumulative return vs benchmark on ONE axis (both in % from range start).
 * Emphasis form: the portfolio in the accent hue, the benchmark in the
 * de-emphasis ink. A legend is always present and a table view twin is one
 * click away (tooltips enhance, never gate).
 *
 * Memoised: the parent re-renders on every market tick, the series does not.
 */
export const PerformanceChart = memo(function PerformanceChart({
  series,
  loading,
}: {
  readonly series: PerformanceSeries | undefined;
  readonly loading: boolean;
}) {
  const { scheme } = useTheme().meridian;
  const f = useFormatters();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const points = series?.points ?? [];
  const data = useMemo(
    () => ({
      dates: points.map((point) => parseDate(point.date)),
      portfolio: points.map((point) => point.portfolio),
      benchmark: points.map((point) => point.benchmark),
    }),
    [points],
  );

  return (
    <Box sx={{ opacity: loading && points.length ? 0.55 : 1, transition: 'opacity 200ms' }}>
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap' }}>
          {series && (
            <LegendKey
              color={scheme.chart.series[0]}
              label="Portfolio"
              value={series.portfolioReturnPercent}
            />
          )}
          {series && (
            <LegendKey
              color={scheme.chart.context}
              label={series.benchmark}
              value={series.benchmarkReturnPercent}
            />
          )}
        </Stack>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, next: 'chart' | 'table' | null) => next && setView(next)}
          aria-label="Chart or table view"
        >
          <Tooltip title="Chart view">
            <ToggleButton value="chart" aria-label="Chart view">
              <ShowChartOutlined fontSize="small" />
            </ToggleButton>
          </Tooltip>
          <Tooltip title="Table view">
            <ToggleButton value="table" aria-label="Table view">
              <TableChartOutlined fontSize="small" />
            </ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
      </Stack>
      {view === 'chart' ? (
        <Box sx={{ height: 300 }}>
          <LineChart
            height={300}
            hideLegend
            skipAnimation
            loading={loading && points.length === 0}
            margin={{ left: 8, right: 16, top: 16, bottom: 8 }}
            grid={{ horizontal: true }}
            xAxis={[
              {
                data: data.dates,
                scaleType: 'time',
                valueFormatter: (date: Date) => f.shortDate(date),
                disableLine: true,
                disableTicks: true,
                tickNumber: 6,
                tickLabelStyle: { fill: scheme.onSurfaceMuted, fontSize: 12 },
              },
            ]}
            yAxis={[
              {
                valueFormatter: (value: number) => f.percent(value, 0),
                disableLine: true,
                disableTicks: true,
                tickNumber: 5,
                width: 44,
                tickLabelStyle: { fill: scheme.onSurfaceMuted, fontSize: 12 },
              },
            ]}
            series={[
              {
                id: 'portfolio',
                label: 'Portfolio',
                data: data.portfolio,
                color: scheme.chart.series[0],
                showMark: false,
                area: true,
                valueFormatter: (value: number | null) => f.signedPercent(value),
              },
              {
                id: 'benchmark',
                label: series?.benchmark ?? 'Benchmark',
                data: data.benchmark,
                color: scheme.chart.context,
                showMark: false,
                valueFormatter: (value: number | null) => f.signedPercent(value),
              },
            ]}
            sx={{
              // Area is a ~10% wash of the series hue, never a saturated block.
              '& .MuiLineChart-area[data-series="portfolio"]': { fillOpacity: 0.1 },
              '& .MuiLineChart-line': { strokeWidth: 2 },
              '& .MuiChartsGrid-line': { stroke: scheme.chart.grid },
            }}
          />
        </Box>
      ) : (
        <Box
          sx={{ height: 300, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 2 }}
        >
          <Table size="small" stickyHeader aria-label="Performance data">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell align="right">Portfolio</TableCell>
                <TableCell align="right">{series?.benchmark ?? 'Benchmark'}</TableCell>
                <TableCell align="right">Active</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...points].reverse().map((point) => (
                <TableRow key={point.date}>
                  <TableCell>{f.date(point.date)}</TableCell>
                  <TableCell align="right">{f.signedPercent(point.portfolio)}</TableCell>
                  <TableCell align="right">{f.signedPercent(point.benchmark)}</TableCell>
                  <TableCell align="right">
                    <TrendText value={point.portfolio - point.benchmark} showIcon={false}>
                      {f.signedPercent(point.portfolio - point.benchmark)}
                    </TrendText>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
});

/**
 * Part-to-whole as thin horizontal bars (one series -> one hue, no legend),
 * values labelled at the bar tip. Preferred over a donut for >6 categories.
 * Memoised for the same reason as the chart.
 */
export const AllocationBars = memo(function AllocationBars({
  exposures,
  max,
}: {
  readonly exposures: readonly Exposure[];
  readonly max?: number;
}) {
  const { scheme } = useTheme().meridian;
  const f = useFormatters();
  const ceiling = max ?? Math.max(...exposures.map((exposure) => exposure.weightPercent), 1);
  return (
    <Stack
      component="ul"
      spacing={1.25}
      sx={{ listStyle: 'none', m: 0, p: 0 }}
      aria-label="Allocation"
    >
      {exposures.map((exposure) => (
        <Box
          component="li"
          key={exposure.key}
          sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(150px, 46%) 1fr 56px',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Typography variant="body1" noWrap title={exposure.key}>
            {exposure.key}
          </Typography>
          <Box sx={{ height: 12, display: 'flex', alignItems: 'center' }}>
            <Box
              sx={{
                height: 12,
                width: `${Math.max(0.5, (exposure.weightPercent / ceiling) * 100)}%`,
                bgcolor: exposure.key === 'Cash' ? scheme.chart.context : scheme.chart.series[0],
                borderRadius: '0 4px 4px 0',
                transition: 'width 300ms cubic-bezier(0.2, 0, 0, 1)',
              }}
            />
          </Box>
          <Typography
            variant="body1"
            sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          >
            {f.percent(exposure.weightPercent, 1)}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
});
