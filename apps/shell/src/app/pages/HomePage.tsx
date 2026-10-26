import AddOutlined from '@mui/icons-material/AddOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import { Box, Button, Typography } from '@mui/material';
import { FeatureFlag, Permission, type RemoteProps } from '@meridian/contracts';
import { formatDateTime } from '@meridian/formatting';
import { PageHeader } from '@meridian/ui';
import { useNavigate } from 'react-router';
import { RemoteCard } from '../components/RemoteCard';
import { RemoteOutlet } from '../components/RemoteOutlet';
import { WIDGET_MODULES, type FederatedModule } from '../modules';
import { useShellHost, useShellIntents } from '../platform-context';

interface WidgetSlot {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly module: FederatedModule;
  /** Shell -> remote input; a constant object, so the outlet never calls update() needlessly. */
  readonly props?: RemoteProps;
  readonly link?: { readonly label: string; readonly path: string };
  readonly permission: Permission;
  readonly flag?: FeatureFlag;
  readonly height: number;
  readonly span: 'full' | 'wide' | 'narrow';
}

const SLOTS: readonly WidgetSlot[] = [
  {
    id: 'summary',
    title: 'Portfolios',
    subtitle: 'Valuation across your entitled funds',
    module: WIDGET_MODULES.summary,
    link: { label: 'All portfolios', path: '/portfolios' },
    permission: Permission.PortfolioRead,
    height: 392,
    span: 'full',
  },
  {
    id: 'orders',
    title: 'Recent orders',
    subtitle: 'Live from the order management blotter',
    module: WIDGET_MODULES.recentOrders,
    props: { limit: 8, interaction: 'open' },
    link: { label: 'Open blotter', path: '/orders' },
    permission: Permission.OrderRead,
    height: 380,
    span: 'wide',
  },
  {
    id: 'alerts',
    title: 'Compliance',
    subtitle: 'Open pre-trade alerts',
    module: WIDGET_MODULES.alerts,
    link: { label: 'Review', path: '/compliance' },
    permission: Permission.ComplianceRead,
    height: 380,
    span: 'narrow',
  },
  {
    id: 'movers',
    title: 'Market movers',
    subtitle: 'Largest moves today (simulated feed)',
    module: WIDGET_MODULES.movers,
    props: { interaction: 'navigate' },
    link: { label: 'Market watch', path: '/market' },
    permission: Permission.MarketDataRead,
    flag: FeatureFlag.HomeMarketMovers,
    height: 340,
    span: 'full',
  },
];

const SPAN_COLUMNS = {
  full: '1 / -1',
  wide: { xs: '1 / -1', lg: 'span 2' },
  narrow: { xs: '1 / -1', lg: 'span 1' },
} as const;

function greeting(date: Date) {
  const hour = date.getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * Overview dashboard composed from widgets owned by four different remotes
 * (three React, one Ext JS). The shell owns layout and chrome; each widget
 * owns its data and rendering, and fails independently.
 */
export function HomePage() {
  const host = useShellHost();
  const { dispatch } = useShellIntents();
  const navigate = useNavigate();
  const user = host.auth.getUser();
  const now = new Date();
  const slots = SLOTS.filter(
    (slot) =>
      host.auth.hasPermission(slot.permission) && (!slot.flag || host.flags.isEnabled(slot.flag)),
  );
  const canTrade = host.auth.hasPermission(Permission.OrderCreate);

  return (
    <Box sx={{ overflowY: 'auto', flex: 1 }}>
      <PageHeader
        title={`${greeting(now)}, ${user.name}`}
        subtitle={`${formatDateTime(now, { style: 'date' })} · ${user.title}`}
        actions={
          canTrade && (
            <Button
              variant="contained"
              startIcon={<AddOutlined />}
              onClick={() => dispatch('trade.ticket.open', {})}
            >
              New order
            </Button>
          )
        }
      />
      <Box
        sx={{
          px: 3,
          pb: 3,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        {slots.map((slot) => {
          const { link } = slot;
          return (
            <RemoteCard
              key={slot.id}
              title={slot.title}
              technology={slot.module.technology}
              subtitle={slot.subtitle}
              height={slot.height}
              gridColumn={SPAN_COLUMNS[slot.span]}
              action={
                link && (
                  <Button
                    size="small"
                    endIcon={<ChevronRightOutlined />}
                    onClick={() => navigate(link.path)}
                  >
                    {link.label}
                  </Button>
                )
              }
            >
              <RemoteOutlet
                remote={slot.module.remote}
                module={slot.module.module}
                label={slot.title}
                variant="embedded"
                props={slot.props}
              />
            </RemoteCard>
          );
        })}
        {slots.length === 0 && (
          <Typography
            color="text.secondary"
            sx={{ gridColumn: '1 / -1', py: 6, textAlign: 'center' }}
          >
            Your role has no dashboard widgets.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
