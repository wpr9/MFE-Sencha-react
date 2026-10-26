import { Box, Chip, Stack } from '@mui/material';
import { SectionCard } from '@meridian/ui';
import type { ReactNode } from 'react';

/** Dashboard card hosting one federated module: title, technology tag, fixed-height body. */
export function RemoteCard({
  title,
  technology,
  subtitle,
  height,
  gridColumn,
  action,
  children,
}: {
  readonly title: string;
  readonly technology: 'React' | 'Ext JS' | 'Shell';
  readonly subtitle: string;
  /** Fixed body height, so remotes that size to their container get a stable box. */
  readonly height: number;
  /** CSS `grid-column`, optionally per breakpoint (`{ xs, lg }`). */
  readonly gridColumn?: string | Readonly<Record<string, string>>;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <SectionCard
      title={
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <span>{title}</span>
          <Chip
            label={technology}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 11, color: 'text.secondary' }}
          />
        </Stack>
      }
      subtitle={subtitle}
      action={action}
      flush
      sx={{ gridColumn }}
    >
      <Box
        sx={{
          height,
          display: 'flex',
          flexDirection: 'column',
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        {children}
      </Box>
    </SectionCard>
  );
}
