import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { Density, ThemePreference } from '@meridian/contracts';
import { PageHeader, SectionCard } from '@meridian/ui';
import type { ReactNode } from 'react';
import { useHostStore } from '../platform-context';

function Row({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      sx={{
        alignItems: { sm: 'center' },
        justifyContent: 'space-between',
        py: 2,
        '& + &': { borderTop: 1, borderColor: 'divider' },
      }}
    >
      <Box>
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="body1" color="text.secondary">
          {description}
        </Typography>
      </Box>
      {children}
    </Stack>
  );
}

/** Theme and density preferences (persisted per user) and the locale in use. */
export function SettingsPage() {
  const preference = useHostStore((state) => state.themePreference);
  const density = useHostStore((state) => state.density);
  const locale = useHostStore((state) => state.locale);
  const timeZone = useHostStore((state) => state.timeZone);
  const setThemePreference = useHostStore((state) => state.setThemePreference);
  const setDensity = useHostStore((state) => state.setDensity);
  return (
    <Box sx={{ overflowY: 'auto', flex: 1 }}>
      <PageHeader
        title="Settings"
        subtitle="Preferences apply to every module, including the Ext JS blotter, and are remembered per user."
      />
      <Box sx={{ px: 3, pb: 3, maxWidth: 880 }}>
        <SectionCard title="Appearance">
          <Row title="Theme" description="Follow your operating system or choose a fixed theme.">
            <ToggleButtonGroup
              exclusive
              size="small"
              value={preference}
              onChange={(_, value: ThemePreference | null) => value && setThemePreference(value)}
              aria-label="Theme"
            >
              <ToggleButton value="light">Light</ToggleButton>
              <ToggleButton value="dark">Dark</ToggleButton>
              <ToggleButton value="system">System</ToggleButton>
            </ToggleButtonGroup>
          </Row>
          <Row title="Density" description="Compact shows more rows in blotters and grids.">
            <ToggleButtonGroup
              exclusive
              size="small"
              value={density}
              onChange={(_, value: Density | null) => value && setDensity(value)}
              aria-label="Density"
            >
              <ToggleButton value="comfortable">Comfortable</ToggleButton>
              <ToggleButton value="compact">Compact</ToggleButton>
            </ToggleButtonGroup>
          </Row>
          <Row
            title="Region"
            description="Numbers, currencies and dates follow your browser locale."
          >
            <Typography variant="body1" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {locale} &middot; {timeZone}
            </Typography>
          </Row>
        </SectionCard>
      </Box>
    </Box>
  );
}
