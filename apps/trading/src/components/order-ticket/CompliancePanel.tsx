import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import type { ComplianceCheckResult } from '@meridian/contracts';
import { StatusChip } from '@meridian/ui';

/** Result of the server-side pre-trade what-if, with its loading and failure states. */
export function CompliancePanel({
  check,
  current,
  ready,
  failed,
  onRetry,
}: {
  readonly check: ComplianceCheckResult | undefined;
  /** The result belongs to the draft on screen (not a previous one). */
  readonly current: boolean;
  /** The draft is complete enough to be checked. */
  readonly ready: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
}) {
  if (!ready) {
    return (
      <Typography variant="body1" color="text.secondary">
        Complete the order to run pre-trade compliance.
      </Typography>
    );
  }
  if (failed) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        Pre-trade compliance is unavailable. The order cannot be placed until it runs.
      </Alert>
    );
  }
  if (!check) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
        <CircularProgress size={16} /> <span>Checking rules…</span>
      </Stack>
    );
  }
  const issues = check.results.filter((result) => result.severity !== 'PASS');
  return (
    <Stack
      spacing={1.25}
      sx={{ opacity: current ? 1 : 0.6, transition: 'opacity 150ms' }}
      aria-busy={!current}
    >
      {!current && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
          <CircularProgress size={14} /> <Typography variant="body2">Re-checking…</Typography>
        </Stack>
      )}
      {check.outcome === 'PASS' && (
        <Alert severity="success">All {check.results.length} pre-trade rules passed.</Alert>
      )}
      {check.outcome === 'WARN' && (
        <Alert severity="warning">
          This order needs compliance approval before it can be routed.
        </Alert>
      )}
      {check.outcome === 'FAIL' && (
        <Alert severity="error">Blocked: this order breaches a hard compliance rule.</Alert>
      )}
      {issues.map((issue) => (
        <Stack key={issue.ruleId} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <StatusChip
            tone={issue.severity === 'FAIL' ? 'error' : 'warning'}
            label={issue.severity === 'FAIL' ? 'Breach' : 'Approval'}
          />
          <Box>
            <Typography variant="subtitle2">{issue.ruleName}</Typography>
            <Typography variant="body1" color="text.secondary">
              {issue.message}
            </Typography>
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
