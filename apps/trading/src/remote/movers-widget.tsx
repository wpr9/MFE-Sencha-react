import { Box, ButtonBase, Typography } from '@mui/material';
import type { Quote } from '@meridian/contracts';
import {
  defineReactRemote,
  useFormatters,
  useHost,
  useHostEvent,
  useIntent,
  useQuotes,
  type WidgetProps,
} from '@meridian/react-sdk';
import { ListSkeleton, TrendText } from '@meridian/ui';
import { useMemo, useState } from 'react';
import { useSecurities } from '../api';

/**
 * Host-supplied props. `navigate` (overview) opens the security via an intent;
 * `focus` (trading desk) publishes `security.focused` for other remotes.
 */
interface MoversProps {
  readonly interaction?: 'navigate' | 'focus';
}

function MoverList({
  title,
  quotes,
  names,
  focused,
  onSelect,
}: {
  readonly title: string;
  readonly quotes: readonly Quote[];
  readonly names: ReadonlyMap<string, string>;
  readonly focused: string | null;
  readonly onSelect: (symbol: string) => void;
}) {
  const f = useFormatters();
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ px: 2.5, py: 1.25, fontWeight: 500, borderBottom: 1, borderColor: 'divider' }}
      >
        {title}
      </Typography>
      {quotes.length === 0 && <ListSkeleton rows={5} rowHeight={32} />}
      {quotes.map((quote) => {
        const selected = quote.symbol === focused;
        return (
          <ButtonBase
            key={quote.symbol}
            onClick={() => onSelect(quote.symbol)}
            aria-current={selected || undefined}
            sx={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: '64px minmax(0, 1fr) auto auto',
              gap: 2,
              alignItems: 'center',
              px: 2.5,
              py: 1.25,
              textAlign: 'left',
              borderBottom: 1,
              borderColor: 'divider',
              boxShadow: selected ? 'inset 3px 0 0 var(--mrd-color-primary)' : 'none',
              bgcolor: selected ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
            }}
          >
            <Typography variant="subtitle2">{quote.symbol}</Typography>
            <Typography variant="body1" color="text.secondary" noWrap>
              {names.get(quote.symbol) ?? ''}
            </Typography>
            <Typography variant="body1" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {f.price(quote.last)}
            </Typography>
            <Box sx={{ width: 84, textAlign: 'right' }}>
              <TrendText value={quote.changePercent}>
                {f.signedPercent(quote.changePercent)}
              </TrendText>
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function MoversWidget({ interaction = 'navigate' }: MoversProps & WidgetProps) {
  const host = useHost();
  const intent = useIntent();
  const securities = useSecurities();
  const [focused, setFocused] = useState<string | null>(null);
  const symbols = useMemo(
    () => (securities.data ?? []).map((security) => security.symbol),
    [securities.data],
  );
  const names = useMemo(
    () => new Map((securities.data ?? []).map((security) => [security.symbol, security.name])),
    [securities.data],
  );
  const quotes = useQuotes(symbols);
  const sorted = useMemo(
    () => [...quotes.values()].sort((a, b) => b.changePercent - a.changePercent),
    [quotes],
  );

  // Follow focus published by any other micro-frontend (e.g. the Ext JS blotter).
  useHostEvent('order.focused', ({ symbol }) => setFocused(symbol));
  useHostEvent('security.focused', ({ symbol }) => setFocused(symbol));

  const select = (symbol: string) => {
    if (interaction === 'focus') {
      setFocused(symbol);
      host.events.publish('security.focused', { symbol });
    } else {
      intent('security.open', { symbol });
    }
  };

  const highlighted = interaction === 'focus' ? focused : null;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        height: '100%',
        overflowY: 'auto',
        '& > *:first-of-type': { borderRight: { md: 1 }, borderColor: 'divider' },
      }}
    >
      <MoverList
        title="Top gainers"
        quotes={sorted.slice(0, 5)}
        names={names}
        focused={highlighted}
        onSelect={select}
      />
      <MoverList
        title="Top decliners"
        quotes={sorted.slice(-5).reverse()}
        names={names}
        focused={highlighted}
        onSelect={select}
      />
    </Box>
  );
}

/** Federated as `trading/MoversWidget` (overview dashboard and trading desk). */
export default defineReactRemote<MoversProps>({ component: MoversWidget });
