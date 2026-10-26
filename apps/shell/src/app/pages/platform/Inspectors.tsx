import { Chip, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import type { AnyEventEnvelope, TelemetryRecord } from '@meridian/contracts';
import { formatDateTime, formatRelativeTime } from '@meridian/formatting';
import { SectionCard, StatusChip } from '@meridian/ui';
import { useEffect, useState } from 'react';
import { usePlatform } from '../../platform-context';

/** Rows shown per inspector; the buffers behind them are larger. */
const MAX_EVENT_ROWS = 50;
const MAX_TELEMETRY_ROWS = 60;

/**
 * Subscribes to a platform buffer that returns a fresh array per read (its
 * history is copied on access), so `useState` + effect rather than
 * `useSyncExternalStore`, which needs a stable snapshot.
 */
function useLive<T>(
  subscribe: (listener: () => void) => () => void,
  read: () => readonly T[],
): readonly T[] {
  const [items, setItems] = useState(read);
  useEffect(() => subscribe(() => setItems(read())), [subscribe, read]);
  return items;
}

const mono = { fontFamily: 'var(--mrd-font-mono)', fontSize: 13 } as const;
const truncated = {
  fontFamily: 'var(--mrd-font-mono)',
  fontSize: 12,
  color: 'text.secondary',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

/** The most recent envelopes on the event bus, newest first. */
export function EventsInspector() {
  const { bus } = usePlatform();
  const events = useLive<AnyEventEnvelope>(bus.subscribeAll, bus.history);
  return (
    <SectionCard
      title="Event bus"
      subtitle="Typed pub/sub between remotes and server push (most recent first)"
      flush
    >
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Time</TableCell>
            <TableCell>Topic</TableCell>
            <TableCell>Source</TableCell>
            <TableCell>Payload</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[...events]
            .reverse()
            .slice(0, MAX_EVENT_ROWS)
            .map((event) => (
              <TableRow key={event.id}>
                <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {formatDateTime(event.timestamp, { style: 'time' })}
                </TableCell>
                <TableCell sx={mono}>{event.topic}</TableCell>
                <TableCell>
                  <Chip size="small" label={event.source} />
                </TableCell>
                <TableCell sx={{ ...truncated, maxWidth: 520 }}>
                  {JSON.stringify(event.payload)}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}

const KIND_TONE = { error: 'error', vital: 'success', timing: 'info', event: 'neutral' } as const;

/** Telemetry records produced in this session, newest first. */
export function TelemetryInspector() {
  const { telemetry } = usePlatform();
  const records = useLive<TelemetryRecord>(telemetry.subscribe, telemetry.recent);
  return (
    <SectionCard
      title="Telemetry"
      subtitle="Batched and shipped with sendBeacon to /api/telemetry; Core Web Vitals included"
      flush
    >
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>When</TableCell>
            <TableCell>Kind</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Source</TableCell>
            <TableCell>Detail</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[...records]
            .reverse()
            .slice(0, MAX_TELEMETRY_ROWS)
            .map((record, index) => (
              <TableRow key={`${record.timestamp}-${record.name}-${index}`}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {formatRelativeTime(record.timestamp)}
                </TableCell>
                <TableCell>
                  <StatusChip tone={KIND_TONE[record.kind]} label={record.kind} icon={null} />
                </TableCell>
                <TableCell sx={mono}>{record.name}</TableCell>
                <TableCell>{record.source}</TableCell>
                <TableCell sx={{ ...truncated, maxWidth: 420 }}>
                  {record.value !== undefined ? `${Math.round(record.value * 100) / 100} ` : ''}
                  {record.error ? record.error.message : JSON.stringify(record.attributes)}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </SectionCard>
  );
}
