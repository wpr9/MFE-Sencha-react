import EastOutlined from '@mui/icons-material/EastOutlined';
import { Box, Chip, Stack, Typography, useTheme } from '@mui/material';
import { formatDateTime } from '@meridian/formatting';
import { EmptyState } from '@meridian/ui';
import { useMemo, useState } from 'react';
import { useMessageFlow, type FlowKind } from '../message-flow';

const KIND_LABEL: Record<FlowKind, string> = {
  state: 'Shell state',
  props: 'Props',
  event: 'Event',
  intent: 'Intent',
  server: 'Server push',
};

/** Technology of each participant, so the audience sees React <-> Ext JS traffic. */
const TECHNOLOGY: Record<string, string> = {
  shell: 'React shell',
  blotter: 'Ext JS',
  portfolio: 'React',
  trading: 'React',
  compliance: 'React',
  server: 'BFF',
};

const FILTERS: Array<{ id: string; label: string; kinds: FlowKind[] }> = [
  { id: 'remotes', label: 'Remote ↔ remote', kinds: ['event', 'intent'] },
  { id: 'shell', label: 'Shell → remotes', kinds: ['state', 'props'] },
  { id: 'server', label: 'Server push', kinds: ['server'] },
];

function Participant({ name }: { readonly name: string }) {
  const tech = TECHNOLOGY[name];
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.5, whiteSpace: 'nowrap' }}
    >
      <Typography component="span" variant="subtitle2">
        {name}
      </Typography>
      {tech && (
        <Typography component="span" variant="body2" color="text.secondary">
          {tech}
        </Typography>
      )}
    </Box>
  );
}

/**
 * Live view of every message crossing a micro-frontend boundary, with its
 * true source - the platform attributes each remote's messages automatically.
 */
export function MessageFlowPanel() {
  const entries = useMessageFlow();
  const { scheme } = useTheme().meridian;
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    remotes: true,
    shell: true,
    server: false,
  });
  const visibleKinds = useMemo(
    () => new Set(FILTERS.filter((filter) => enabled[filter.id]).flatMap((filter) => filter.kinds)),
    [enabled],
  );
  const visible = entries.filter((entry) => visibleKinds.has(entry.kind)).slice(0, 40);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          px: 2.5,
          py: 1.25,
          borderBottom: 1,
          borderColor: 'divider',
          flexWrap: 'wrap',
          rowGap: 1,
        }}
      >
        {FILTERS.map((filter) => (
          <Chip
            key={filter.id}
            size="small"
            label={filter.label}
            variant={enabled[filter.id] ? 'filled' : 'outlined'}
            color={enabled[filter.id] ? 'primary' : 'default'}
            onClick={() =>
              setEnabled((current) => ({ ...current, [filter.id]: !current[filter.id] }))
            }
            aria-pressed={enabled[filter.id]}
          />
        ))}
      </Stack>
      <Box
        role="log"
        aria-live="polite"
        aria-label="Message flow"
        sx={{ flex: 1, overflowY: 'auto' }}
      >
        {visible.length === 0 ? (
          <EmptyState
            compact
            title="No messages yet"
            description="Select an order, click a market mover, or change the workspace portfolio."
          />
        ) : (
          visible.map((entry, index) => (
            <Box
              key={entry.id}
              sx={{
                px: 2.5,
                py: 1,
                borderBottom: 1,
                borderColor: 'divider',
                '@keyframes mrdFlowIn': {
                  from: { backgroundColor: scheme.primaryContainer },
                  to: { backgroundColor: 'transparent' },
                },
                animation: index === 0 ? 'mrdFlowIn 1.2s cubic-bezier(0.2, 0, 0, 1)' : 'none',
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25 }}
              >
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontVariantNumeric: 'tabular-nums', width: 64 }}
                >
                  {formatDateTime(entry.at, { style: 'time' })}
                </Typography>
                <Participant name={entry.from} />
                <EastOutlined sx={{ fontSize: 16, color: 'text.secondary' }} aria-label="to" />
                <Typography component="span" variant="subtitle2" sx={{ whiteSpace: 'nowrap' }}>
                  {entry.to}
                </Typography>
                <Chip
                  size="small"
                  label={KIND_LABEL[entry.kind]}
                  sx={{ height: 20, fontSize: 11 }}
                />
              </Stack>
              <Typography
                variant="body2"
                sx={{ pl: '72px', mt: 0.25, fontFamily: 'var(--mrd-font-mono)', fontSize: 12 }}
              >
                {entry.label}
                <Box component="span" sx={{ color: 'text.secondary' }}>
                  {entry.detail ? `  ${entry.detail}` : ''}
                </Box>
              </Typography>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
