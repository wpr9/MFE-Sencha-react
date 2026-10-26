import { Box, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { PageHeader } from '@meridian/ui';
import { useMemo, useState } from 'react';
import { MessageFlowPanel } from '../components/MessageFlowPanel';
import { RemoteCard } from '../components/RemoteCard';
import { RemoteOutlet } from '../components/RemoteOutlet';
import { WIDGET_MODULES } from '../modules';
import { useHostStore } from '../platform-context';

/** Rows the Ext JS blotter widget shows; the shell changes it live through props. */
const ROW_OPTIONS = [8, 15, 30] as const;
type Rows = (typeof ROW_OPTIONS)[number];
const DEFAULT_ROWS: Rows = 15;
/** Props that never change are module constants, so the outlet never sees a new identity. */
const MOVERS_PROPS = { interaction: 'focus' } as const;
const INSIGHT_PROPS = { symbol: 'MSFT' } as const;

const CARD_HEIGHT = { top: 430, bottom: 360 } as const;

/**
 * Trading desk: three independently deployed micro-frontends (Ext JS and
 * React, built by different teams) on one screen. They never import each
 * other; all coordination flows through the platform, live in the panel.
 */
export function DeskPage() {
  const activePortfolioId = useHostStore((state) => state.activePortfolioId);
  const locale = useHostStore((state) => state.locale);
  const [rows, setRows] = useState<Rows>(DEFAULT_ROWS);
  // Props are owned by the shell; a new object calls the remote's update()
  // without a remount - even for the Ext JS widget.
  const blotterProps = useMemo(() => ({ limit: rows, interaction: 'focus' }), [rows]);

  return (
    <Box sx={{ overflowY: 'auto', flex: 1 }}>
      <PageHeader
        title="Trading desk"
        subtitle="Independently deployed micro-frontends - Ext JS and React - coordinating through the platform. No shared code, no direct imports."
        meta={
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}
          >
            <Typography variant="body2" color="text.secondary">
              Shell → remotes:
            </Typography>
            <Chip
              size="small"
              label={`Portfolio context: ${activePortfolioId ?? 'all portfolios'}`}
            />
            <Chip size="small" label={`Locale: ${locale}`} />
          </Stack>
        }
        actions={
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Blotter rows (prop)
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={rows}
              onChange={(_, value: Rows | null) => value && setRows(value)}
              aria-label="Blotter rows"
            >
              {ROW_OPTIONS.map((option) => (
                <ToggleButton key={option} value={option}>
                  {option}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>
        }
      />
      <Box
        sx={{
          px: 3,
          pb: 3,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: 'repeat(12, minmax(0, 1fr))' },
        }}
      >
        <RemoteCard
          title="Orders"
          technology={WIDGET_MODULES.recentOrders.technology}
          subtitle="Publishes order.focused · follows security.focused, the workspace portfolio and the rows prop"
          height={CARD_HEIGHT.top}
          gridColumn={{ xs: '1 / -1', lg: 'span 7' }}
        >
          <RemoteOutlet
            {...WIDGET_MODULES.recentOrders}
            label="Orders"
            variant="embedded"
            props={blotterProps}
          />
        </RemoteCard>
        <RemoteCard
          title="Security insight"
          technology={WIDGET_MODULES.securityInsight.technology}
          subtitle="Follows order.focused and security.focused from any remote · dispatches trade.ticket.open"
          height={CARD_HEIGHT.top}
          gridColumn={{ xs: '1 / -1', lg: 'span 5' }}
        >
          <RemoteOutlet
            {...WIDGET_MODULES.securityInsight}
            label="Security insight"
            variant="embedded"
            props={INSIGHT_PROPS}
          />
        </RemoteCard>
        <RemoteCard
          title="Market movers"
          technology={WIDGET_MODULES.movers.technology}
          subtitle="Publishes security.focused · follows focus from the other remotes"
          height={CARD_HEIGHT.bottom}
          gridColumn={{ xs: '1 / -1', lg: 'span 7' }}
        >
          <RemoteOutlet
            {...WIDGET_MODULES.movers}
            label="Market movers"
            variant="embedded"
            props={MOVERS_PROPS}
          />
        </RemoteCard>
        <RemoteCard
          title="Message flow"
          technology="Shell"
          subtitle="Every message crossing a micro-frontend boundary, attributed to its source"
          height={CARD_HEIGHT.bottom}
          gridColumn={{ xs: '1 / -1', lg: 'span 5' }}
        >
          <MessageFlowPanel />
        </RemoteCard>
      </Box>
    </Box>
  );
}
