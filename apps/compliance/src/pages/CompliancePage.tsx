import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import {
  AlertResolutionSchema,
  Permission,
  describeError,
  type ComplianceAlert,
  type ComplianceRule,
  type RuleUtilization,
} from '@meridian/contracts';
import { useFormatters, useHost, useIntent, usePermission } from '@meridian/react-sdk';
import {
  EmptyState,
  ErrorState,
  Meter,
  PageHeader,
  SectionCard,
  StatTile,
  StatusChip,
} from '@meridian/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAlerts, useLiveCompliance, useResolveAlert, useRules, useUtilization } from '../api';

type Decision = 'APPROVE' | 'REJECT';

function ResolveDialog({
  alert,
  decision,
  onClose,
}: {
  readonly alert: ComplianceAlert | null;
  readonly decision: Decision;
  readonly onClose: () => void;
}) {
  // Keyed by alert id at the call site, so every alert starts with a fresh form.
  const resolve = useResolveAlert();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!alert) return null;
  const submit = async () => {
    setError(null);
    try {
      await resolve.mutateAsync({ alertId: alert.id, resolution: { decision, comment } });
      onClose();
    } catch (failure) {
      setError(describeError(failure));
    }
  };
  // The same rule the BFF applies (`AlertResolutionSchema`): validated here only for feedback.
  const valid = AlertResolutionSchema.safeParse({ decision, comment }).success;
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="resolve-title">
      <DialogTitle id="resolve-title">
        {decision === 'APPROVE' ? 'Approve order' : 'Reject order'}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          {alert.portfolioName} &middot; {alert.symbol} &middot; order {alert.orderId}.{' '}
          {alert.message}
        </Typography>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={3}
          label="Justification"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          helperText="Required. Recorded in the audit trail with your name and the time."
          error={comment.length > 0 && !valid}
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color={decision === 'APPROVE' ? 'primary' : 'error'}
          disabled={!valid || resolve.isPending}
          onClick={() => void submit()}
        >
          {decision === 'APPROVE' ? 'Approve' : 'Reject'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AlertCard({
  alert,
  focused,
  onResolve,
}: {
  readonly alert: ComplianceAlert;
  readonly focused: boolean;
  readonly onResolve: (alert: ComplianceAlert, decision: Decision) => void;
}) {
  const f = useFormatters();
  const intent = useIntent();
  const { scheme } = useTheme().meridian;
  const host = useHost();
  // Same rule as the BFF: resolving needs both permissions, and never your own order (four eyes).
  const canManage = usePermission(Permission.ComplianceManage);
  const canApprove = usePermission(Permission.OrderApprove);
  const canResolve = canManage && canApprove;
  const ownOrder = alert.raisedBy.id === host.auth.getUser().id;
  const open = alert.status === 'OPEN';
  const { orderId } = alert;
  return (
    <Card
      id={`alert-${alert.id}`}
      sx={{
        p: 2.5,
        borderColor: focused ? scheme.primary : undefined,
        boxShadow: focused ? `0 0 0 1px ${scheme.primary}` : 'none',
        transition: 'box-shadow 300ms',
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', mb: 1, flexWrap: 'wrap', rowGap: 1 }}
          >
            {open ? (
              <StatusChip
                tone={alert.severity === 'FAIL' ? 'error' : 'warning'}
                label="Awaiting decision"
              />
            ) : (
              <StatusChip
                tone={alert.status === 'APPROVED' ? 'success' : 'error'}
                label={alert.status === 'APPROVED' ? 'Approved' : 'Rejected'}
              />
            )}
            <Chip size="small" label={alert.id} sx={{ fontFamily: 'var(--mrd-font-mono)' }} />
            <Typography variant="body2" color="text.secondary">
              Raised {f.relative(alert.raisedAt)} by {alert.raisedBy.name}
            </Typography>
          </Stack>
          <Typography variant="h5">
            {alert.portfolioName} &middot; {alert.symbol}
          </Typography>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 0.5 }}>
            {alert.ruleName}
          </Typography>
          <Typography variant="body1" sx={{ mt: 1 }}>
            {alert.message}
          </Typography>
          {!open && alert.resolvedBy && (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              {alert.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {alert.resolvedBy.name}{' '}
              {alert.resolvedAt ? f.relative(alert.resolvedAt) : ''}: &ldquo;
              {alert.resolutionComment}&rdquo;
            </Typography>
          )}
        </Box>
        <Stack
          direction={{ xs: 'row', md: 'column' }}
          spacing={1}
          sx={{ flexShrink: 0, alignItems: { md: 'flex-end' } }}
        >
          {orderId && (
            <Button
              size="small"
              endIcon={<OpenInNewOutlined />}
              onClick={() => intent('order.open', { orderId })}
            >
              Order {orderId}
            </Button>
          )}
          {open && canResolve && ownOrder && (
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 220 }}>
              Four-eyes rule: another officer must resolve an order you raised.
            </Typography>
          )}
          {open && canResolve && !ownOrder && (
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" color="error" onClick={() => onResolve(alert, 'REJECT')}>
                Reject
              </Button>
              <Button variant="contained" onClick={() => onResolve(alert, 'APPROVE')}>
                Approve
              </Button>
            </Stack>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}

function Approvals({ focusId }: { readonly focusId: string | null }) {
  const alerts = useAlerts();
  const [resolving, setResolving] = useState<{ alert: ComplianceAlert; decision: Decision } | null>(
    null,
  );
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  // Bring a deep-linked alert into view once - not again on every refetch or pushed alert.
  // `alerts.data` is a dependency on purpose: the card may only exist after the data arrives.
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || scrolledTo.current === focusId) return;
    const element = document.getElementById(`alert-${focusId}`);
    if (!element) return;
    scrolledTo.current = focusId;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusId, alerts.data]);
  if (alerts.isError)
    return (
      <ErrorState message="Alerts could not be loaded." onRetry={() => void alerts.refetch()} />
    );
  const list = (alerts.data ?? []).filter(
    (alert) => filter === 'all' || alert.status === 'OPEN' || alert.id === focusId,
  );
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1}>
        <Chip
          label={`Open (${(alerts.data ?? []).filter((a) => a.status === 'OPEN').length})`}
          color={filter === 'open' ? 'primary' : 'default'}
          variant={filter === 'open' ? 'filled' : 'outlined'}
          onClick={() => setFilter('open')}
        />
        <Chip
          label={`All (${alerts.data?.length ?? 0})`}
          color={filter === 'all' ? 'primary' : 'default'}
          variant={filter === 'all' ? 'filled' : 'outlined'}
          onClick={() => setFilter('all')}
        />
      </Stack>
      {!alerts.isPending && list.length === 0 && (
        <EmptyState
          icon={<FactCheckOutlined />}
          title="No open alerts"
          description="Orders that need compliance approval appear here in real time."
        />
      )}
      {list.map((alert) => (
        <AlertCard
          key={alert.id}
          alert={alert}
          focused={alert.id === focusId}
          onResolve={(target, decision) => setResolving({ alert: target, decision })}
        />
      ))}
      <ResolveDialog
        key={resolving?.alert.id ?? 'none'}
        alert={resolving?.alert ?? null}
        decision={resolving?.decision ?? 'APPROVE'}
        onClose={() => setResolving(null)}
      />
    </Stack>
  );
}

/** Short label for a utilisation meter; the rulebook is the source of truth for names. */
const meterLabel = (rule: ComplianceRule | undefined, ruleId: string) =>
  rule?.kind === 'issuer-concentration'
    ? 'Largest issuer'
    : rule?.kind === 'sector-concentration'
      ? 'Largest sector'
      : rule?.kind === 'minimum-cash'
        ? 'Cash buffer'
        : (rule?.name ?? ruleId);

function Utilization() {
  const utilization = useUtilization();
  const rules = useRules();
  const f = useFormatters();
  const ruleById = useMemo(
    () => new Map((rules.data ?? []).map((rule) => [rule.id, rule])),
    [rules.data],
  );
  const byPortfolio = useMemo(() => {
    const groups = new Map<string, RuleUtilization[]>();
    for (const row of utilization.data ?? [])
      groups.set(row.portfolioName, [...(groups.get(row.portfolioName) ?? []), row]);
    return [...groups.entries()];
  }, [utilization.data]);
  if (utilization.isError)
    return (
      <ErrorState
        message="Utilisation could not be loaded."
        onRetry={() => void utilization.refetch()}
      />
    );
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(3, minmax(0, 1fr))' },
      }}
    >
      {byPortfolio.map(([portfolio, rows]) => (
        <SectionCard key={portfolio} title={portfolio} subtitle="Limit utilisation (live)">
          <Stack spacing={2.5}>
            {rows.map((row) => (
              <Box key={row.ruleId}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.75, gap: 1 }}>
                  <Typography variant="subtitle2">
                    {meterLabel(ruleById.get(row.ruleId), row.ruleId)}
                  </Typography>
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {row.driver}
                  </Typography>
                </Stack>
                <Meter
                  value={row.utilizationPercent}
                  status={row.status}
                  label={`${meterLabel(ruleById.get(row.ruleId), row.ruleId)} utilisation`}
                />
                <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.75 }}>
                  <Typography variant="body2" color="text.secondary">
                    {ruleById.get(row.ruleId)?.kind === 'minimum-cash'
                      ? `Minimum ${f.percent(row.limit, 0)}`
                      : `Limit ${f.percent(row.limit, 0)}`}
                  </Typography>
                  {row.status !== 'ok' ? (
                    <StatusChip
                      tone={row.status === 'breach' ? 'error' : 'warning'}
                      label={row.status === 'breach' ? 'Breach' : 'Near limit'}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {f.percent(row.utilizationPercent, 0)} used
                    </Typography>
                  )}
                </Stack>
              </Box>
            ))}
          </Stack>
        </SectionCard>
      ))}
    </Box>
  );
}

function Rules() {
  const rules = useRules();
  return (
    <SectionCard
      title="Rulebook"
      subtitle="Evaluated pre-trade on every order and continuously against live positions"
      flush
    >
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Rule</TableCell>
            <TableCell>Applies to</TableCell>
            <TableCell>On breach</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(rules.data ?? []).map((rule) => (
            <TableRow key={rule.id}>
              <TableCell>
                <Typography variant="subtitle2">{rule.name}</Typography>
                <Typography variant="body1" color="text.secondary">
                  {rule.description}
                </Typography>
              </TableCell>
              <TableCell>{rule.scope}</TableCell>
              <TableCell>
                {rule.breachSeverity === 'FAIL' ? (
                  <StatusChip tone="error" label="Block order" />
                ) : (
                  <StatusChip tone="warning" label="Require approval" />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

/** Approvals queue, limit utilisation and the rulebook. */
export function CompliancePage() {
  useLiveCompliance();
  const [params] = useSearchParams();
  const focusId = params.get('focus');
  const [tab, setTab] = useState<'approvals' | 'utilization' | 'rules'>('approvals');
  const alerts = useAlerts();
  const utilization = useUtilization();
  const canManage = usePermission(Permission.ComplianceManage);
  const open = (alerts.data ?? []).filter((alert) => alert.status === 'OPEN').length;
  const nearLimit = (utilization.data ?? []).filter((row) => row.status !== 'ok').length;
  const resolved = (alerts.data ?? []).filter((alert) => alert.status !== 'OPEN').length;
  // A deep link to an alert (e.g. from a notification) brings Approvals forward.
  const [lastFocus, setLastFocus] = useState(focusId);
  if (focusId !== lastFocus) {
    setLastFocus(focusId);
    if (focusId) setTab('approvals');
  }

  return (
    <Box>
      <PageHeader
        title="Compliance"
        subtitle={
          canManage
            ? 'Review pre-trade breaches and approve or reject orders (four-eyes principle).'
            : 'Pre-trade alerts on your orders and limit utilisation of your portfolios.'
        }
      >
        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0, 220px))' },
            py: 2,
          }}
        >
          <StatTile label="Awaiting decision" value={String(open)} loading={alerts.isPending} />
          <StatTile
            label="Limits near or over"
            value={String(nearLimit)}
            loading={utilization.isPending}
          />
          <StatTile label="Resolved" value={String(resolved)} loading={alerts.isPending} />
        </Box>
        <Tabs
          value={tab}
          onChange={(_, value: typeof tab) => setTab(value)}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="approvals" label="Approvals" />
          <Tab value="utilization" label="Utilisation" />
          <Tab value="rules" label="Rules" />
        </Tabs>
      </PageHeader>
      <Box sx={{ p: 3 }}>
        {tab === 'approvals' ? (
          <Approvals focusId={focusId} />
        ) : tab === 'utilization' ? (
          <Utilization />
        ) : (
          <Rules />
        )}
      </Box>
    </Box>
  );
}
