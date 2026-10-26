import { Box, Tab, Tabs } from '@mui/material';
import { PageHeader } from '@meridian/ui';
import { useState } from 'react';
import { Access } from './Access';
import { Flags } from './Flags';
import { EventsInspector, TelemetryInspector } from './Inspectors';
import { MicroFrontends } from './MicroFrontends';

const TABS = [
  { id: 'mfe', label: 'Micro-frontends', render: () => <MicroFrontends /> },
  { id: 'access', label: 'Session & access', render: () => <Access /> },
  { id: 'flags', label: 'Feature flags', render: () => <Flags /> },
  { id: 'events', label: 'Event bus', render: () => <EventsInspector /> },
  { id: 'telemetry', label: 'Telemetry', render: () => <TelemetryInspector /> },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Diagnostics: how the workspace is assembled at runtime. The first stop when something is off. */
export function PlatformPage() {
  const [tab, setTab] = useState<TabId>('mfe');
  const current = TABS.find((candidate) => candidate.id === tab) ?? TABS[0];
  return (
    <Box sx={{ overflowY: 'auto', flex: 1 }}>
      <PageHeader title="Platform" subtitle="How this workspace is assembled at runtime">
        <Tabs
          value={tab}
          onChange={(_, value: TabId) => setTab(value)}
          sx={{ mt: 1.5, borderBottom: 1, borderColor: 'divider' }}
        >
          {TABS.map((item) => (
            <Tab key={item.id} value={item.id} label={item.label} />
          ))}
        </Tabs>
      </PageHeader>
      <Box sx={{ p: 3 }}>{current.render()}</Box>
    </Box>
  );
}
