import { Box } from '@mui/material';
import type { Quote } from '@meridian/contracts';
import { useFormatters } from '@meridian/react-sdk';

/** Bid, ask, day range (and optionally volume) of one quote as a compact labelled grid. */
export function QuoteStats({
  quote,
  volume = false,
}: {
  readonly quote: Quote | undefined;
  readonly volume?: boolean;
}) {
  const f = useFormatters();
  const stats: Array<[label: string, value: string]> = [
    ['Bid', f.price(quote?.bid)],
    ['Ask', f.price(quote?.ask)],
    ['Day range', quote ? `${f.price(quote.dayLow)} – ${f.price(quote.dayHigh)}` : '—'],
  ];
  if (volume) stats.push(['Volume', f.compact(quote?.volume)]);
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
        gap: 1,
        typography: 'body2',
        color: 'text.secondary',
        '& strong': {
          display: 'block',
          color: 'text.primary',
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
        },
      }}
    >
      {stats.map(([label, value]) => (
        <span key={label}>
          {label}
          <strong>{value}</strong>
        </span>
      ))}
    </Box>
  );
}
