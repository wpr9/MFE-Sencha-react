import { Box, Button, Stack, Typography } from '@mui/material';
import { ALL_PERMISSIONS, describeError } from '@meridian/contracts';
import { formatDateTime } from '@meridian/formatting';
import { SectionCard, StatusChip } from '@meridian/ui';
import { useState } from 'react';
import { usePlatform, useSessionState, useShellHost } from '../../platform-context';

/** Session facts and the user's effective permissions and entitlements. */
export function Access() {
  const host = useShellHost();
  const platform = usePlatform();
  const { session, remainingMs, phase } = useSessionState();
  const [busy, setBusy] = useState(false);
  return (
    <Stack spacing={2}>
      <SectionCard
        title="Session"
        subtitle="Server-side session behind an HttpOnly, SameSite=Strict cookie; no tokens in the browser"
      >
        <Box
          component="dl"
          sx={{
            display: 'grid',
            gridTemplateColumns: '200px 1fr',
            rowGap: 1.25,
            m: 0,
            '& dt': { color: 'text.secondary' },
            '& dd': { m: 0 },
          }}
        >
          <dt>User</dt>
          <dd>
            {session.user.name} ({session.user.email})
          </dd>
          <dt>Authentication</dt>
          <dd>{session.authMode === 'mock' ? 'Mock identity provider (demo)' : 'OIDC'}</dd>
          <dt>Issued</dt>
          <dd>{formatDateTime(session.issuedAt)}</dd>
          <dt>Idle expiry</dt>
          <dd>
            {formatDateTime(session.expiresAt)} ({Math.round(remainingMs / 1000)} s, {phase})
          </dd>
          <dt>Absolute expiry</dt>
          <dd>{formatDateTime(session.absoluteExpiresAt)}</dd>
          <dt>CSRF token</dt>
          <dd
            style={{ fontFamily: 'var(--mrd-font-mono)' }}
          >{`${session.csrfToken.slice(0, 6)}… (sent as x-csrf-token on unsafe requests)`}</dd>
        </Box>
        {session.authMode === 'mock' && (
          <Button
            sx={{ mt: 2 }}
            variant="outlined"
            disabled={busy || phase !== 'active'}
            onClick={() => {
              setBusy(true);
              // Mock IdP only: the idle timeout lapses in ~75 s, so the warning
              // dialog appears after ~15 s of inactivity.
              platform.session
                .simulateExpiry()
                .catch((error: unknown) =>
                  host.notifications.toast({ severity: 'error', message: describeError(error) }),
                )
                .finally(() => setBusy(false));
            }}
          >
            Simulate idle timeout (demo)
          </Button>
        )}
      </SectionCard>
      <SectionCard
        title="Permissions"
        subtitle="Effective permissions computed by the BFF from your roles. The UI hides what you cannot do; the API refuses it."
      >
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {ALL_PERMISSIONS.map((permission) => (
            <StatusChip
              key={permission}
              tone={session.permissions.includes(permission) ? 'success' : 'neutral'}
              label={permission}
              icon={session.permissions.includes(permission) ? undefined : null}
            />
          ))}
        </Stack>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
          Portfolio entitlements:{' '}
          {session.entitlements.portfolios.all
            ? 'all portfolios'
            : session.entitlements.portfolios.ids.join(', ')}
        </Typography>
      </SectionCard>
    </Stack>
  );
}
