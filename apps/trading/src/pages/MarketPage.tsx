import AddOutlined from '@mui/icons-material/AddOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import {
  Box,
  Button,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  useTheme,
} from '@mui/material';
import { DataGrid, useGridApiRef, type GridColDef } from '@mui/x-data-grid';
import { Permission, type Quote, type Security } from '@meridian/contracts';
import {
  useConnectionStatus,
  useFormatters,
  useIntent,
  usePermission,
  useQuotes,
} from '@meridian/react-sdk';
import {
  ErrorState,
  FlashValue,
  GridCell,
  LiveIndicator,
  PageHeader,
  SectionCard,
  SecurityCell,
  StatTile,
  TrendText,
} from '@meridian/ui';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSecurities } from '../api';

interface Row extends Security {
  readonly quote: Quote | undefined;
  readonly last: number | null;
  readonly changePercent: number | null;
}

const getRowId = (row: Row) => row.symbol;

/** Where today's last price sits between the day's low and high. */
function DayRange({ quote }: { readonly quote: Quote | undefined }) {
  const { scheme } = useTheme().meridian;
  const f = useFormatters();
  if (!quote) return null;
  const span = quote.dayHigh - quote.dayLow || 1;
  // Clamped: the simulator can print a last outside the day's range for a tick.
  const position = Math.min(100, Math.max(0, ((quote.last - quote.dayLow) / span) * 100));
  return (
    <Tooltip title={`Low ${f.price(quote.dayLow)} · High ${f.price(quote.dayHigh)}`}>
      <Box
        sx={{
          width: '100%',
          height: 4,
          borderRadius: 2,
          bgcolor: scheme.surfaceContainerHigh,
          position: 'relative',
        }}
        role="img"
        aria-label="Position in day range"
      >
        <Box
          sx={{
            position: 'absolute',
            top: -3,
            left: `calc(${position}% - 5px)`,
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: scheme.primary,
            border: `2px solid ${scheme.surface}`,
          }}
        />
      </Box>
    </Tooltip>
  );
}

/** Market watch: the security master joined with live quotes, filterable, with a `?symbol=` deep link. */
export function MarketPage() {
  const securities = useSecurities();
  const f = useFormatters();
  const intent = useIntent();
  const canTrade = usePermission(Permission.OrderCreate);
  const status = useConnectionStatus();
  const { twoLineRowHeight } = useTheme().meridian;
  const apiRef = useGridApiRef();
  const [params] = useSearchParams();
  const focusSymbol = params.get('symbol');
  const [assetClass, setAssetClass] = useState<'all' | Security['assetClass']>('all');
  const [query, setQuery] = useState('');
  const symbols = useMemo(
    () => (securities.data ?? []).map((security) => security.symbol),
    [securities.data],
  );
  const quotes = useQuotes(symbols);

  // Filtering depends on user input only; joining the quotes runs per tick. Keeping
  // them apart means a tick never re-runs the text search over every security.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (securities.data ?? []).filter(
      (security) =>
        (assetClass === 'all' || security.assetClass === assetClass) &&
        (!q ||
          security.symbol.toLowerCase().includes(q) ||
          security.name.toLowerCase().includes(q) ||
          security.sector.toLowerCase().includes(q)),
    );
  }, [securities.data, assetClass, query]);
  const rows = useMemo<Row[]>(
    () =>
      filtered.map((security) => {
        const quote = quotes.get(security.symbol);
        return {
          ...security,
          quote,
          last: quote?.last ?? null,
          changePercent: quote?.changePercent ?? null,
        };
      }),
    [filtered, quotes],
  );

  const breadth = useMemo(() => {
    const all = [...quotes.values()];
    const sorted = [...all].sort((a, b) => b.changePercent - a.changePercent);
    return {
      up: all.filter((q) => q.change > 0).length,
      down: all.filter((q) => q.change < 0).length,
      best: sorted[0],
      worst: sorted[sorted.length - 1],
    };
  }, [quotes]);

  // Deep link (?symbol=): select the row and bring it into view. The grid is
  // auto-height inside the page scroller, so the row element itself is scrolled
  // (scrollToIndexes only moves the grid's own viewport, and it is sorted).
  useEffect(() => {
    const api = apiRef.current;
    if (!focusSymbol || !securities.data || !api?.getRow(focusSymbol)) return undefined;
    api.setRowSelectionModel({ type: 'include', ids: new Set([focusSymbol]) });
    const frame = requestAnimationFrame(() =>
      api.getRowElement(focusSymbol)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [apiRef, focusSymbol, securities.data]);

  const columns = useMemo<GridColDef<Row>[]>(
    () => [
      {
        field: 'symbol',
        headerName: 'Security',
        minWidth: 240,
        flex: 1.4,
        renderCell: ({ row }) => (
          <GridCell>
            <SecurityCell symbol={row.symbol} name={row.name} />
          </GridCell>
        ),
      },
      { field: 'sector', headerName: 'Sector', minWidth: 140, flex: 1 },
      {
        field: 'last',
        headerName: 'Last',
        type: 'number',
        minWidth: 100,
        renderCell: ({ row }) => <FlashValue value={row.last}>{f.price(row.last)}</FlashValue>,
      },
      {
        field: 'change',
        headerName: 'Change',
        type: 'number',
        minWidth: 100,
        valueGetter: (_value, row) => row.quote?.change ?? null,
        renderCell: ({ row }) => (
          <TrendText value={row.quote?.change}>{f.signed(row.quote?.change)}</TrendText>
        ),
      },
      {
        field: 'changePercent',
        headerName: 'Change %',
        type: 'number',
        minWidth: 100,
        renderCell: ({ row }) => (
          <TrendText value={row.changePercent} showIcon={false}>
            {f.signedPercent(row.changePercent)}
          </TrendText>
        ),
      },
      {
        field: 'bid',
        headerName: 'Bid',
        type: 'number',
        minWidth: 90,
        valueGetter: (_value, row) => row.quote?.bid ?? null,
        valueFormatter: (value: number | null) => f.price(value),
      },
      {
        field: 'ask',
        headerName: 'Ask',
        type: 'number',
        minWidth: 90,
        valueGetter: (_value, row) => row.quote?.ask ?? null,
        valueFormatter: (value: number | null) => f.price(value),
      },
      {
        field: 'range',
        headerName: 'Day range',
        minWidth: 120,
        sortable: false,
        renderCell: ({ row }) => (
          <GridCell>
            <DayRange quote={row.quote} />
          </GridCell>
        ),
      },
      {
        field: 'volume',
        headerName: 'Volume',
        type: 'number',
        minWidth: 90,
        valueGetter: (_value, row) => row.quote?.volume ?? null,
        valueFormatter: (value: number | null) => f.compact(value),
      },
      {
        field: 'trade',
        headerName: '',
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        width: 84,
        align: 'right',
        renderCell: ({ row }) =>
          canTrade ? (
            <Button
              size="small"
              onClick={() => intent('trade.ticket.open', { symbol: row.symbol })}
            >
              Trade
            </Button>
          ) : null,
      },
    ],
    [f, canTrade, intent],
  );

  return (
    <Box>
      <PageHeader
        title="Market"
        subtitle="Simulated real-time quotes, multiplexed over the workspace's single server stream"
        meta={<LiveIndicator status={status} />}
        actions={
          canTrade && (
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={() => intent('trade.ticket.open', {})}
            >
              New order
            </Button>
          )
        }
      />
      <Box sx={{ px: 3, pb: 3 }}>
        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' },
            mb: 3,
          }}
        >
          <StatTile label="Advancing" value={String(breadth.up)} loading={quotes.size === 0} />
          <StatTile label="Declining" value={String(breadth.down)} loading={quotes.size === 0} />
          <StatTile
            label="Top gainer"
            value={breadth.best?.symbol ?? '—'}
            delta={f.signedPercent(breadth.best?.changePercent)}
            deltaValue={breadth.best?.changePercent}
            loading={quotes.size === 0}
          />
          <StatTile
            label="Top decliner"
            value={breadth.worst?.symbol ?? '—'}
            delta={f.signedPercent(breadth.worst?.changePercent)}
            deltaValue={breadth.worst?.changePercent}
            loading={quotes.size === 0}
          />
        </Box>
        {securities.isError ? (
          <ErrorState
            message="Securities could not be loaded."
            onRetry={() => void securities.refetch()}
          />
        ) : (
          <SectionCard
            title="Market watch"
            subtitle={`${rows.length} securities`}
            action={
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={assetClass}
                  onChange={(_, value: typeof assetClass | null) => value && setAssetClass(value)}
                  aria-label="Asset class"
                >
                  <ToggleButton value="all">All</ToggleButton>
                  <ToggleButton value="Equity">Equity</ToggleButton>
                  <ToggleButton value="ETF">ETF</ToggleButton>
                  <ToggleButton value="Fixed Income">Bonds</ToggleButton>
                </ToggleButtonGroup>
                <TextField
                  size="small"
                  placeholder="Filter"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchOutlined fontSize="small" />
                        </InputAdornment>
                      ),
                    },
                    htmlInput: { 'aria-label': 'Filter securities' },
                  }}
                  sx={{ width: 200 }}
                />
              </Stack>
            }
            flush
          >
            <DataGrid
              apiRef={apiRef}
              rows={rows}
              columns={columns}
              getRowId={getRowId}
              rowHeight={twoLineRowHeight}
              autoHeight
              hideFooter
              loading={securities.isPending}
              initialState={{ sorting: { sortModel: [{ field: 'changePercent', sort: 'desc' }] } }}
              aria-label="Market watch"
            />
          </SectionCard>
        )}
      </Box>
    </Box>
  );
}
