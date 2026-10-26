import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import { Box, Button, Chip, Stack, Typography, useTheme } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { IntradaySeriesSchema, Permission, apiPaths } from '@meridian/contracts';
import {
  useFormatters,
  useHost,
  useHostEvent,
  useHostState,
  useIntent,
  usePermission,
  useQuote,
} from '@meridian/react-sdk';
import { EmptyState, TrendText } from '@meridian/ui';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { usePortfolioDetail, useSecurities } from '../api';
import { QuoteStats } from './QuoteStats';

interface Point {
  readonly t: string;
  readonly price: number;
}

interface Focus {
  readonly symbol: string;
  readonly portfolioId?: string;
  readonly orderId?: string;
  /** Remote (or `shell`) that caused the focus, from the event envelope. */
  readonly source: string;
  readonly via: string;
}

/**
 * Intraday moves are small: scale to the day's range (with headroom), never to zero.
 * Total: MUI X calls it for an empty series too (±Infinity), and a flat line at zero
 * must still get a non-empty domain.
 */
const padDomain = (min: { valueOf(): number }, max: { valueOf(): number }) => {
  const low = Number(min);
  const high = Number(max);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return { min: 0, max: 1 };
  const pad = (high - low) * 0.15 || Math.abs(high) * 0.002 || 1;
  return { min: low - pad, max: high + pad };
};

/** Live points kept per symbol: the BFF's intraday history is 360 one-second prints; keep as many. */
const MAX_POINTS = 360;

/** Shown beside the event source so the demo audience sees React <-> Ext JS traffic. */
const TECHNOLOGY: ReadonlyMap<string, string> = new Map([
  ['blotter', 'Ext JS'],
  ['trading', 'React'],
  ['portfolio', 'React'],
  ['compliance', 'React'],
  ['shell', 'shell'],
]);
/** A Map, not an object: a source named like an Object method must not resolve to one. */
const technologyLabel = (source: string) => {
  const technology = TECHNOLOGY.get(source);
  return technology ? ` (${technology})` : '';
};

function useIntraday(symbol: string | undefined) {
  const { http } = useHost();
  return useQuery({
    queryKey: ['intraday', symbol],
    // `skipToken` (not `enabled: false`) keeps the key stable and the types honest while
    // no security is focused.
    queryFn: symbol
      ? ({ signal }) =>
          http.get(apiPaths.intraday(symbol), { signal, parser: IntradaySeriesSchema })
      : skipToken,
    staleTime: 60_000,
  });
}

/** Intraday history plus live ticks appended from the shared market-data stream. */
function useLiveSeries(symbol: string | undefined, base: readonly Point[] | undefined): Point[] {
  const host = useHost();
  const [live, setLive] = useState<{ symbol?: string; points: Point[] }>({ points: [] });
  useEffect(() => {
    if (!symbol) return undefined;
    return host.marketData.subscribe([symbol], (quotes) => {
      const quote = quotes.get(symbol);
      if (!quote) return;
      const point = { t: quote.timestamp, price: quote.last };
      setLive((previous) => ({
        symbol,
        points: (previous.symbol === symbol ? [...previous.points, point] : [point]).slice(
          -MAX_POINTS,
        ),
      }));
    });
  }, [host, symbol]);
  return useMemo(() => {
    const history = base ?? [];
    const lastHistoric = history.at(-1)?.t ?? '';
    const extra =
      live.symbol === symbol ? live.points.filter((point) => point.t > lastHistoric) : [];
    return [...history, ...extra].slice(-MAX_POINTS);
  }, [base, live, symbol]);
}

/**
 * Follows the security focused by ANY micro-frontend - an order selected in
 * the Ext JS blotter (`order.focused`) or a security picked in another React
 * remote (`security.focused`) - without importing either of them.
 */
export function SecurityInsight({ initialSymbol }: { readonly initialSymbol?: string }) {
  const f = useFormatters();
  const intent = useIntent();
  const { scheme } = useTheme().meridian;
  const canTrade = usePermission(Permission.OrderCreate);
  const activePortfolioId = useHostState((state) => state.activePortfolioId);
  const [focus, setFocus] = useState<Focus | null>(
    initialSymbol ? { symbol: initialSymbol, source: 'shell', via: 'props.symbol' } : null,
  );

  useHostEvent('order.focused', (payload, envelope) =>
    setFocus({
      symbol: payload.symbol,
      portfolioId: payload.portfolioId,
      orderId: payload.orderId,
      source: envelope.source,
      via: envelope.topic,
    }),
  );
  useHostEvent('security.focused', (payload, envelope) =>
    setFocus((current) => ({
      symbol: payload.symbol,
      portfolioId: current?.portfolioId,
      source: envelope.source,
      via: envelope.topic,
    })),
  );

  const symbol = focus?.symbol;
  const securities = useSecurities();
  const security = securities.data?.find((candidate) => candidate.symbol === symbol);
  const quote = useQuote(symbol);
  const intraday = useIntraday(symbol);
  const series = useLiveSeries(symbol, intraday.data?.points);
  const portfolioId = focus?.portfolioId ?? activePortfolioId ?? undefined;
  const portfolio = usePortfolioDetail(portfolioId);
  const holding = portfolio.data?.holdings.find((candidate) => candidate.symbol === symbol);

  if (!focus || !symbol) {
    return (
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
        <EmptyState
          compact
          icon={<InsightsOutlined />}
          title="Nothing focused yet"
          description="Select an order in the Ext JS blotter or a security in Market movers."
        />
      </Box>
    );
  }

  return (
    <Stack
      spacing={1.5}
      sx={{ p: 2.5, height: '100%', boxSizing: 'border-box', overflow: 'hidden' }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="p">
            {symbol}
          </Typography>
          <Typography variant="body1" color="text.secondary" noWrap>
            {security ? `${security.name} · ${security.exchange}` : ' '}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography
            sx={{ fontFamily: 'var(--mrd-font-brand)', fontSize: 28, lineHeight: '36px' }}
          >
            {f.price(quote?.last)}
          </Typography>
          {quote && (
            <TrendText value={quote.change}>
              {f.signed(quote.change)} ({f.signedPercent(quote.changePercent)})
            </TrendText>
          )}
        </Box>
      </Stack>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
        aria-live="polite"
      >
        <Typography variant="body2" color="text.secondary">
          Following
        </Typography>
        <Chip
          size="small"
          label={`${focus.via} from ${focus.source}${technologyLabel(focus.source)}`}
          sx={{
            bgcolor: scheme.primaryContainer,
            color: scheme.onPrimaryContainer,
            fontFamily: 'var(--mrd-font-mono)',
            fontSize: 12,
          }}
        />
        {focus.orderId && (
          <Chip
            size="small"
            label={focus.orderId}
            sx={{ fontFamily: 'var(--mrd-font-mono)', fontSize: 12 }}
          />
        )}
      </Stack>
      <Box sx={{ flex: 1, minHeight: 120 }}>
        <LineChart
          hideLegend
          skipAnimation
          loading={intraday.isPending}
          margin={{ left: 4, right: 8, top: 8, bottom: 4 }}
          grid={{ horizontal: true }}
          xAxis={[
            {
              data: series.map((point) => new Date(point.t)),
              scaleType: 'time',
              disableLine: true,
              disableTicks: true,
              tickNumber: 4,
              valueFormatter: (date: Date) => f.shortTime(date),
              tickLabelStyle: { fill: scheme.onSurfaceMuted, fontSize: 11 },
            },
          ]}
          yAxis={[
            {
              disableLine: true,
              disableTicks: true,
              tickNumber: 4,
              width: 52,
              domainLimit: padDomain,
              valueFormatter: (value: number) => f.price(value),
              tickLabelStyle: { fill: scheme.onSurfaceMuted, fontSize: 11 },
            },
          ]}
          series={[
            {
              id: 'price',
              data: series.map((point) => point.price),
              color: scheme.chart.series[0],
              showMark: false,
              area: true,
              baseline: 'min',
              valueFormatter: (value: number | null) => f.price(value),
            },
          ]}
          sx={{
            '& .MuiLineChart-area[data-series="price"]': { fillOpacity: 0.1 },
            '& .MuiLineChart-line': { strokeWidth: 2 },
            '& .MuiChartsGrid-line': { stroke: scheme.chart.grid },
          }}
        />
      </Box>
      <QuoteStats quote={quote} volume />
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          pt: 1,
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="body1" color="text.secondary" sx={{ minWidth: 0 }} noWrap>
          {!portfolioId
            ? 'Pick a workspace portfolio to see positions'
            : holding
              ? `${portfolioId}: ${f.quantity(holding.quantity)} shares · ${f.percent(holding.weightPercent)} of NAV`
              : `${portfolioId}: no position`}
        </Typography>
        {canTrade && (
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => intent('trade.ticket.open', { symbol, portfolioId, side: 'SELL' })}
            >
              Sell
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => intent('trade.ticket.open', { symbol, portfolioId, side: 'BUY' })}
            >
              Buy
            </Button>
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
