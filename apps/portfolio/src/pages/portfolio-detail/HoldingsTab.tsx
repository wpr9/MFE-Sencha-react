import AddShoppingCartOutlined from '@mui/icons-material/AddShoppingCartOutlined';
import RemoveShoppingCartOutlined from '@mui/icons-material/RemoveShoppingCartOutlined';
import { Box, IconButton, Stack, Tooltip, useTheme } from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Permission, type PortfolioDetail } from '@meridian/contracts';
import { useFormatters, useIntent, usePermission } from '@meridian/react-sdk';
import { FlashValue, GridCell, SectionCard, SecurityCell, TrendText } from '@meridian/ui';
import { useMemo } from 'react';
import type { LiveHolding, LiveValuation } from './useLiveHoldings';

const getRowId = (row: LiveHolding) => row.symbol;
/** Drift beyond this many percentage points from target is highlighted. */
const DRIFT_WARNING_PP = 0.5;
/** "Sell" prefills a tenth of the position - a nudge, not a decision. */
const SELL_PREFILL_FRACTION = 0.1;

/** Every position with live price, value, weight and drift against target. */
export function HoldingsTab({
  portfolio,
  live,
}: {
  readonly portfolio: PortfolioDetail;
  readonly live: LiveValuation;
}) {
  const f = useFormatters();
  const intent = useIntent();
  const canTrade = usePermission(Permission.OrderCreate);
  const { twoLineRowHeight } = useTheme().meridian;
  const columns = useMemo<GridColDef<LiveHolding>[]>(
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
        field: 'quantity',
        headerName: 'Quantity',
        type: 'number',
        minWidth: 110,
        valueFormatter: (value: number) => f.quantity(value),
      },
      {
        field: 'livePrice',
        headerName: 'Price',
        type: 'number',
        minWidth: 100,
        renderCell: ({ row }) => (
          <FlashValue value={row.livePrice}>{f.price(row.livePrice)}</FlashValue>
        ),
      },
      {
        field: 'liveDayPercent',
        headerName: 'Today',
        type: 'number',
        minWidth: 100,
        renderCell: ({ row }) => (
          <TrendText value={row.liveDayPercent}>{f.signedPercent(row.liveDayPercent)}</TrendText>
        ),
      },
      {
        field: 'liveValue',
        headerName: 'Market value',
        type: 'number',
        minWidth: 130,
        valueFormatter: (value: number) => f.currency(value),
      },
      {
        field: 'liveWeight',
        headerName: 'Weight',
        type: 'number',
        minWidth: 120,
        renderCell: ({ row }) => (
          <Tooltip title={`Target ${f.percent(row.targetWeightPercent)}`}>
            <span>{f.percent(row.liveWeight)}</span>
          </Tooltip>
        ),
      },
      {
        field: 'drift',
        headerName: 'vs target',
        type: 'number',
        minWidth: 100,
        valueGetter: (_value, row) => row.liveWeight - row.targetWeightPercent,
        renderCell: ({ value }: { value?: number }) => (
          <Box
            component="span"
            sx={{
              color: Math.abs(value ?? 0) > DRIFT_WARNING_PP ? 'warning.main' : 'text.secondary',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {f.signed(value)} pp
          </Box>
        ),
      },
      {
        field: 'livePnl',
        headerName: 'Unrealised P&L',
        type: 'number',
        minWidth: 140,
        renderCell: ({ row }) => (
          <TrendText value={row.livePnl}>{f.signedCurrency(row.livePnl, true)}</TrendText>
        ),
      },
      {
        field: 'actions',
        headerName: '',
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        width: 96,
        align: 'right',
        renderCell: ({ row }) =>
          canTrade ? (
            <Stack direction="row">
              <Tooltip title={`Buy ${row.symbol}`}>
                <IconButton
                  size="small"
                  aria-label={`Buy ${row.symbol}`}
                  onClick={() =>
                    intent('trade.ticket.open', {
                      portfolioId: portfolio.id,
                      symbol: row.symbol,
                      side: 'BUY',
                    })
                  }
                >
                  <AddShoppingCartOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={`Sell ${row.symbol}`}>
                <IconButton
                  size="small"
                  aria-label={`Sell ${row.symbol}`}
                  onClick={() =>
                    intent('trade.ticket.open', {
                      portfolioId: portfolio.id,
                      symbol: row.symbol,
                      side: 'SELL',
                      quantity: Math.round(row.quantity * SELL_PREFILL_FRACTION),
                    })
                  }
                >
                  <RemoveShoppingCartOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          ) : null,
      },
    ],
    [f, canTrade, intent, portfolio.id],
  );
  return (
    <SectionCard
      title="Holdings"
      subtitle={`${live.rows.length} positions · prices stream live`}
      flush
    >
      <DataGrid
        rows={live.rows}
        columns={columns}
        getRowId={getRowId}
        rowHeight={twoLineRowHeight}
        autoHeight
        hideFooter
        disableRowSelectionOnClick
        showToolbar
        initialState={{ sorting: { sortModel: [{ field: 'liveValue', sort: 'desc' }] } }}
        aria-label="Holdings"
      />
    </SectionCard>
  );
}
