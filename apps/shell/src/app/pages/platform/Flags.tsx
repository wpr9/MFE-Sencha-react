import {
  Chip,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { SectionCard, StatusChip } from '@meridian/ui';
import { useSyncExternalStore } from 'react';
import { usePlatform } from '../../platform-context';

/** Server-evaluated feature flags with local overrides (outside production). */
export function Flags() {
  const platform = usePlatform();
  const { flags } = platform;
  const overrides = useSyncExternalStore(flags.subscribe, flags.getOverrides);
  const server = platform.session.getState().session.flags;
  return (
    <SectionCard
      title="Feature flags"
      subtitle="Evaluated per user by the server; local overrides apply in non-production environments only"
      flush
    >
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Flag</TableCell>
            <TableCell>Server value</TableCell>
            <TableCell>Effective</TableCell>
            <TableCell align="right">Override</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Object.keys(server).map((flag) => (
            <TableRow key={flag}>
              <TableCell sx={{ fontFamily: 'var(--mrd-font-mono)', fontSize: 13 }}>
                {flag}
              </TableCell>
              <TableCell>{String(server[flag])}</TableCell>
              <TableCell>
                <StatusChip
                  tone={flags.isEnabled(flag) ? 'success' : 'neutral'}
                  label={flags.isEnabled(flag) ? 'On' : 'Off'}
                  icon={null}
                />
              </TableCell>
              <TableCell align="right">
                <Switch
                  checked={flags.isEnabled(flag)}
                  onChange={(_, checked) =>
                    flags.setOverride(flag, checked === server[flag] ? null : checked)
                  }
                  slotProps={{ input: { 'aria-label': `Override ${flag}` } }}
                />
                {flag in overrides && <Chip size="small" label="overridden" sx={{ ml: 1 }} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, py: 1.5 }}>
        Overrides take effect when a module next mounts (navigate away and back).
      </Typography>
    </SectionCard>
  );
}
