import { Box, Stack, Typography, useTheme } from '@mui/material';
import type { Security } from '@meridian/contracts';
import { useFormatters, useQuote } from '@meridian/react-sdk';
import { TrendText } from '@meridian/ui';
import { QuoteStats } from '../QuoteStats';

/** Live quote of the selected security. Subscribes on its own so ticks re-render only this panel. */
export function QuotePanel({ security }: { readonly security: Security | undefined }) {
  const quote = useQuote(security?.symbol);
  const f = useFormatters();
  const { scheme } = useTheme().meridian;
  if (!security) {
    return (
      <Box sx={{ p: 2, borderRadius: 3, bgcolor: scheme.surfaceContainer }}>
        <Typography variant="body1" color="text.secondary">
          Choose a security to see its live quote.
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ p: 2, borderRadius: 3, bgcolor: scheme.surfaceContainer }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2">{security.symbol}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {security.name} &middot; {security.exchange}
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
      {quote && (
        <Box sx={{ mt: 1.5 }}>
          <QuoteStats quote={quote} />
        </Box>
      )}
    </Box>
  );
}
