import {
  Chip,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { HOST_CONTRACT_VERSION } from '@meridian/contracts';
import { SectionCard, StatusChip } from '@meridian/ui';
import { useSyncExternalStore } from 'react';
import { FEDERATED_MODULES } from '../../modules';
import {
  getRegistry,
  getRegistryProblems,
  getRemoteStatus,
  getStatusVersion,
  isOutageSimulated,
  moduleId,
  setOutageSimulated,
  subscribeRemoteStatus,
} from '../../remotes';

/** Runtime registry, every federated module's load state, and the resilience drill. */
export function MicroFrontends() {
  useSyncExternalStore(subscribeRemoteStatus, getStatusVersion);
  const registry = getRegistry();
  return (
    <Stack spacing={2}>
      <SectionCard
        title="Runtime registry"
        subtitle={`Loaded at boot from /config/remotes.json - each environment ships its own (this one: ${registry.environment ?? 'unspecified'})`}
        flush
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Remote</TableCell>
              <TableCell>Manifest</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.entries(registry.remotes).map(([name, remote]) => (
              <TableRow key={name}>
                <TableCell sx={{ fontWeight: 500 }}>{name}</TableCell>
                <TableCell sx={{ fontFamily: 'var(--mrd-font-mono)', fontSize: 13 }}>
                  {remote.entry}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
      <SectionCard
        title="Federated modules"
        subtitle={`Host contract ${HOST_CONTRACT_VERSION} · every module exposes mount / update / unmount`}
        flush
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Module</TableCell>
              <TableCell>Technology</TableCell>
              <TableCell>Used for</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Load time</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {FEDERATED_MODULES.map((m) => {
              const id = moduleId(m.remote, m.module);
              const status = getRemoteStatus(id);
              return (
                <TableRow key={id}>
                  <TableCell sx={{ fontFamily: 'var(--mrd-font-mono)', fontSize: 13 }}>
                    {id}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={m.technology} variant="outlined" />
                  </TableCell>
                  <TableCell>{m.role}</TableCell>
                  <TableCell>
                    {status.state === 'ready' ? (
                      <StatusChip tone="success" label={`Mounted · ${status.contract}`} />
                    ) : status.state === 'failed' ? (
                      <StatusChip tone="error" label="Failed" />
                    ) : status.state === 'loading' ? (
                      <StatusChip tone="info" label="Loading" />
                    ) : (
                      <StatusChip tone="neutral" label="Not loaded yet" />
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {status.state === 'ready' ? `${status.loadMs} ms` : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SectionCard>
      <ResilienceDrill />
    </Stack>
  );
}

/**
 * Resilience drill: take a remote "offline" and watch the workspace degrade to a
 * contained error for that remote only - every other page and widget keeps working.
 */
function ResilienceDrill() {
  useSyncExternalStore(subscribeRemoteStatus, getStatusVersion);
  const problems = getRegistryProblems();
  return (
    <SectionCard
      title="Resilience drill"
      subtitle="Simulate an outage of one remote. Pages and widgets from it show a contained error with Retry; the rest of the workspace is unaffected."
    >
      <Stack spacing={1}>
        {Object.keys(getRegistry().remotes).map((name) => {
          const down = isOutageSimulated(name);
          return (
            <Stack key={name} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Switch
                checked={!down}
                onChange={(_, online) => setOutageSimulated(name, !online)}
                slotProps={{ input: { 'aria-label': `${name} online` } }}
              />
              <Typography variant="subtitle2" sx={{ width: 120 }}>
                {name}
              </Typography>
              <StatusChip
                tone={down ? 'error' : 'success'}
                label={down ? 'Offline (simulated)' : 'Online'}
              />
            </Stack>
          );
        })}
        {problems.map((problem) => (
          <Typography key={problem.remote} variant="body2" color="error">
            Registry: {problem.remote === '*' ? 'document' : problem.remote} - {problem.error}
          </Typography>
        ))}
      </Stack>
    </SectionCard>
  );
}
