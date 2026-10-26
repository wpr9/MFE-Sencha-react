import { Box, Typography } from '@mui/material';
import type { OrderType } from '@meridian/contracts';
import { useFormatters, useQuote } from '@meridian/react-sdk';

/**
 * Estimated notional and share of NAV. Owns the quote subscription so a
 * market tick re-renders these two figures, not the whole form.
 */
export function OrderEstimate({
  symbol,
  quantity,
  orderType,
  limitPrice,
  nav,
}: {
  readonly symbol: string | undefined;
  readonly quantity: number | null | undefined;
  readonly orderType: OrderType | undefined;
  readonly limitPrice: number | null | undefined;
  /** Portfolio NAV, once the portfolio has loaded. */
  readonly nav: number | undefined;
}) {
  const f = useFormatters();
  const quote = useQuote(symbol);
  const price = orderType === 'LIMIT' && limitPrice ? limitPrice : (quote?.last ?? 0);
  const notional = (quantity ?? 0) * price;
  const navShare = nav ? (notional / nav) * 100 : null;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 2,
        p: 2,
        borderRadius: 3,
        border: 1,
        borderColor: 'divider',
      }}
    >
      <Box>
        <Typography variant="body2" color="text.secondary">
          Estimated notional
        </Typography>
        <Typography variant="h5" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {notional ? f.currency(notional) : '—'}
        </Typography>
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary">
          Share of portfolio NAV
        </Typography>
        <Typography variant="h5" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {navShare !== null && notional ? f.percent(navShare, 2) : '—'}
        </Typography>
      </Box>
    </Box>
  );
}
