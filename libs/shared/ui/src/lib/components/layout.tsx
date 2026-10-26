import { Box, Card, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import { CssBaseline, ThemeProvider } from '@mui/material';
import type { Density, ThemeMode } from '@meridian/contracts';
import { useMemo, type ReactNode } from 'react';
import { createMeridianTheme } from '../theme';

export interface MeridianThemeProviderProps {
  readonly mode: ThemeMode;
  readonly density?: Density;
  /** Only the shell installs global baseline styles; remotes never do. */
  readonly baseline?: boolean;
  readonly children: ReactNode;
}

/** Installs the Meridian MUI theme for one React root (the shell's, or a remote's). */
export function MeridianThemeProvider({
  mode,
  density = 'comfortable',
  baseline = false,
  children,
}: MeridianThemeProviderProps) {
  const theme = useMemo(() => createMeridianTheme(mode, density), [mode, density]);
  return (
    <ThemeProvider theme={theme}>
      {baseline && <CssBaseline enableColorScheme />}
      {children}
    </ThemeProvider>
  );
}

export interface PageHeaderProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  /** Small context line above the title (breadcrumb / object type). */
  readonly eyebrow?: ReactNode;
  readonly actions?: ReactNode;
  readonly meta?: ReactNode;
  readonly children?: ReactNode;
}

/** Page title block. Exactly one `h1` per page, focused on route change by the shell. */
export function PageHeader({ title, subtitle, eyebrow, actions, meta, children }: PageHeaderProps) {
  return (
    <Box component="header" sx={{ px: 3, pt: 2.5, pb: children ? 0 : 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ alignItems: { md: 'flex-start' }, justifyContent: 'space-between' }}
      >
        <Box sx={{ minWidth: 0 }}>
          {eyebrow && (
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
              {eyebrow}
            </Typography>
          )}
          <Typography
            variant="h3"
            component="h1"
            tabIndex={-1}
            data-page-title
            sx={{ outline: 'none' }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
          {meta && <Box sx={{ mt: 1.5 }}>{meta}</Box>}
        </Box>
        {actions && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
          >
            {actions}
          </Stack>
        )}
      </Stack>
      {children}
    </Box>
  );
}

export interface SectionCardProps {
  readonly title?: ReactNode;
  readonly subtitle?: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  /** Remove body padding (tables, grids that bleed to the edges). */
  readonly flush?: boolean;
  readonly sx?: SxProps<Theme>;
  readonly id?: string;
}

/** Outlined surface with an optional header row - the basic dashboard unit. */
export function SectionCard({
  title,
  subtitle,
  action,
  children,
  flush = false,
  sx,
  id,
}: SectionCardProps) {
  return (
    <Card
      component="section"
      aria-labelledby={id && title ? `${id}-title` : undefined}
      sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, ...sx }}
    >
      {(title || action) && (
        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2.5,
            pt: 2,
            pb: flush ? 1.5 : 0,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            {title && (
              <Typography id={id ? `${id}-title` : undefined} variant="h5" component="h2">
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Stack>
      )}
      <Box sx={{ p: flush ? 0 : 2.5, pt: title && !flush ? 2 : undefined, flex: 1, minHeight: 0 }}>
        {children}
      </Box>
    </Card>
  );
}

/** Hides content visually while keeping it available to assistive technology. */
export const visuallyHidden = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const;

/** Vertically centres custom content inside a data-grid cell. */
export function GridCell({
  align = 'left',
  children,
}: {
  readonly align?: 'left' | 'right' | 'center';
  readonly children: ReactNode;
}) {
  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent:
          align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
      }}
    >
      {children}
    </Box>
  );
}
