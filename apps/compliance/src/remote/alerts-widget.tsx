import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { defineReactRemote, useFormatters, useIntent, useNow } from '@meridian/react-sdk';
import { EmptyState, ErrorState, ListSkeleton, StatusChip } from '@meridian/ui';
import { useAlerts, useLiveCompliance } from '../api';

/** Rows that fit the dashboard card without scrolling. */
const MAX_ROWS = 5;

/** Open compliance alerts for the overview dashboard. */
function AlertsWidget() {
  useLiveCompliance();
  const alerts = useAlerts();
  const f = useFormatters();
  const now = useNow();
  const intent = useIntent();
  if (alerts.isError)
    return (
      <ErrorState compact message="Alerts unavailable." onRetry={() => void alerts.refetch()} />
    );
  const open = (alerts.data ?? []).filter((alert) => alert.status === 'OPEN');
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'baseline', px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography
          sx={{
            fontFamily: 'var(--mrd-font-brand)',
            fontSize: 40,
            lineHeight: '48px',
            fontWeight: 500,
          }}
        >
          {alerts.isPending ? '–' : open.length}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          awaiting a compliance decision
        </Typography>
      </Stack>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {alerts.isPending && <ListSkeleton rows={3} rowHeight={44} />}
        {!alerts.isPending && open.length === 0 && (
          <EmptyState
            compact
            icon={<FactCheckOutlined />}
            title="All clear"
            description="No orders need approval."
          />
        )}
        {open.slice(0, MAX_ROWS).map((alert) => (
          <ButtonBase
            key={alert.id}
            onClick={() => intent('compliance.alert.open', { alertId: alert.id })}
            sx={{
              width: '100%',
              display: 'block',
              textAlign: 'left',
              px: 2.5,
              py: 1.5,
              borderBottom: 1,
              borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Stack
              direction="row"
              sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1 }}
            >
              <Typography variant="subtitle2" noWrap>
                {alert.portfolioName} &middot; {alert.symbol}
              </Typography>
              <StatusChip tone="warning" label="Approval" />
            </Stack>
            <Typography variant="body1" color="text.secondary" noWrap>
              {alert.ruleName}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {alert.raisedBy.name} &middot; {f.relative(alert.raisedAt, now)}
            </Typography>
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}

/** Federated as `compliance/AlertsWidget` (overview dashboard). */
export default defineReactRemote({ component: AlertsWidget });
