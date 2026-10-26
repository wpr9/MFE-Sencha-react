import type {} from '@mui/x-data-grid/themeAugmentation';
import { alpha, createTheme, type Theme } from '@mui/material/styles';
import {
  colorSchemes,
  elevation,
  layout,
  motion,
  radius,
  typography,
  type ColorMode,
  type ColorScheme,
  type TypeRole,
} from '@meridian/design-tokens';

import type { Density } from '@meridian/contracts';

export type { Density };

/** Values the design system exposes on the MUI theme (`useTheme().meridian`). */
export interface MeridianThemeExtras {
  readonly mode: ColorMode;
  readonly density: Density;
  readonly scheme: ColorScheme;
  /** Grid row height for the current density; `twoLineRowHeight` for rows with a second line. */
  readonly rowHeight: number;
  readonly twoLineRowHeight: number;
}

declare module '@mui/material/styles' {
  interface Theme {
    meridian: MeridianThemeExtras;
  }
  interface ThemeOptions {
    meridian?: MeridianThemeExtras;
  }
}

const fonts = typography.fontFamily;

function type(role: TypeRole) {
  const spec = typography.scale[role];
  return {
    fontFamily: fonts[spec.family],
    fontSize: `${spec.size / 16}rem`,
    lineHeight: `${spec.lineHeight}px`,
    fontWeight: spec.weight,
    letterSpacing: 0,
  } as const;
}

const cache = new Map<string, Theme>();

/**
 * Builds (and memoises) the Meridian MUI theme for a mode and density.
 * Every value derives from @meridian/design-tokens, the same source the
 * Ext JS remote consumes as CSS variables.
 */
export function createMeridianTheme(mode: ColorMode, density: Density = 'comfortable'): Theme {
  const key = `${mode}:${density}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const s = colorSchemes[mode];
  const shadows = elevation[mode];
  const compact = density === 'compact';

  const theme = createTheme({
    meridian: {
      mode,
      density,
      scheme: s,
      rowHeight: layout.rowHeight[density],
      twoLineRowHeight: layout.twoLineRowHeight[density],
    },
    palette: {
      mode,
      primary: {
        main: s.primary,
        dark: s.primaryHover,
        light: s.primaryContainer,
        contrastText: s.onPrimary,
      },
      secondary: { main: s.onSurfaceVariant, contrastText: s.surface },
      error: { main: s.status.error.fg },
      warning: { main: s.status.warning.fg },
      success: { main: s.status.success.fg },
      info: { main: s.status.info.fg },
      background: { default: s.background, paper: s.surface },
      text: {
        primary: s.onSurface,
        secondary: s.onSurfaceVariant,
        disabled: alpha(s.onSurface, 0.38),
      },
      divider: s.divider,
      action: {
        hover: s.hoverOverlay,
        selected: s.selected,
        focus: s.pressedOverlay,
        active: s.onSurfaceVariant,
      },
    },
    shape: { borderRadius: radius.sm },
    shadows: [
      'none',
      shadows[1],
      shadows[1],
      shadows[2],
      shadows[2],
      shadows[2],
      shadows[3],
      shadows[3],
      shadows[3],
      ...Array<string>(16).fill(shadows[3]),
    ] as Theme['shadows'],
    typography: {
      fontFamily: fonts.plain,
      htmlFontSize: 16,
      h1: type('displaySmall'),
      h2: type('headlineMedium'),
      h3: type('headlineSmall'),
      h4: type('titleLarge'),
      h5: type('titleMedium'),
      h6: type('titleSmall'),
      subtitle1: type('bodyLarge'),
      subtitle2: type('labelLarge'),
      body1: type('bodyMedium'),
      body2: type('bodySmall'),
      caption: { ...type('bodySmall'), color: s.onSurfaceMuted },
      overline: { ...type('labelSmall'), textTransform: 'uppercase', letterSpacing: '0.06em' },
      button: { ...type('labelLarge'), textTransform: 'none' },
    },
    transitions: {
      easing: {
        easeInOut: motion.easing.standard,
        easeOut: motion.easing.decelerate,
        easeIn: motion.easing.accelerate,
        sharp: motion.easing.standard,
      },
      duration: {
        shortest: 100,
        shorter: 150,
        short: 200,
        standard: 250,
        complex: 300,
        enteringScreen: 250,
        leavingScreen: 200,
      },
    },
    zIndex: { appBar: 1100, drawer: 1200, modal: 1300, snackbar: 1400, tooltip: 1500 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
          body: { backgroundColor: s.background, color: s.onSurface, ...type('bodyMedium') },
          '::selection': { backgroundColor: s.primaryContainer, color: s.onPrimaryContainer },
          ':focus-visible': { outline: `2px solid ${s.focusRing}`, outlineOffset: 2 },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              transitionDuration: '0.01ms !important',
            },
          },
        },
      },
      MuiButtonBase: { defaultProps: { disableRipple: false } },
      MuiButton: {
        defaultProps: { disableElevation: true, size: compact ? 'small' : 'medium' },
        styleOverrides: {
          root: {
            borderRadius: radius.full,
            paddingInline: 16,
            minHeight: 36,
            fontFamily: fonts.brand,
          },
          sizeSmall: { minHeight: 32, paddingInline: 12 },
          contained: { '&:hover': { backgroundColor: s.primaryHover, boxShadow: shadows[1] } },
          outlined: {
            borderColor: s.outline,
            '&:hover': { borderColor: s.outline, backgroundColor: s.hoverOverlay },
          },
          text: { paddingInline: 12 },
          startIcon: { marginRight: 6, '& > *:nth-of-type(1)': { fontSize: 18 } },
          endIcon: { '& > *:nth-of-type(1)': { fontSize: 18 } },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { color: s.onSurfaceVariant, '&:hover': { backgroundColor: s.hoverOverlay } },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: 'none' }, rounded: { borderRadius: radius.md } },
      },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            borderColor: s.outlineVariant,
            backgroundColor: s.surface,
          },
        },
      },
      MuiAppBar: { defaultProps: { elevation: 0, color: 'transparent' } },
      MuiTooltip: {
        defaultProps: { arrow: false, enterDelay: 400 },
        styleOverrides: {
          tooltip: {
            backgroundColor: s.surfaceInverse,
            color: s.onSurfaceInverse,
            ...type('bodySmall'),
            borderRadius: radius.xs,
            padding: '6px 10px',
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: radius.sm,
            fontFamily: fonts.brand,
            fontWeight: 500,
            '&.MuiChip-filled.MuiChip-colorDefault': {
              backgroundColor: s.surfaceContainerHigh,
              color: s.onSurfaceVariant,
            },
          },
          outlined: { borderColor: s.outlineVariant },
          sizeSmall: { height: 24 },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 48 },
          indicator: { height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            ...type('titleSmall'),
            minHeight: 48,
            textTransform: 'none',
            color: s.onSurfaceVariant,
            paddingInline: 16,
            '&.Mui-selected': { color: s.primary },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: radius.xl, backgroundColor: s.surface, boxShadow: shadows[3] },
        },
      },
      MuiDialogTitle: {
        styleOverrides: { root: { ...type('headlineSmall'), padding: '24px 24px 16px' } },
      },
      MuiDialogActions: { styleOverrides: { root: { padding: '16px 24px 24px', gap: 8 } } },
      MuiPopover: {
        styleOverrides: {
          paper: {
            borderRadius: radius.sm,
            boxShadow: shadows[2],
            border: mode === 'dark' ? `1px solid ${s.outlineVariant}` : 'none',
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { borderRadius: radius.sm, boxShadow: shadows[2], minWidth: 200 },
          list: { paddingBlock: 8 },
        },
      },
      MuiMenuItem: { styleOverrides: { root: { minHeight: 40, ...type('bodyMedium'), gap: 12 } } },
      MuiListItemIcon: { styleOverrides: { root: { minWidth: 36, color: s.onSurfaceVariant } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: radius.xs,
            backgroundColor: s.surface,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: s.outline },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: s.onSurface },
          },
        },
      },
      MuiTextField: { defaultProps: { size: compact ? 'small' : 'medium' } },
      MuiSelect: { defaultProps: { size: compact ? 'small' : 'medium' } },
      MuiInputLabel: { styleOverrides: { root: { color: s.onSurfaceVariant } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: s.divider, ...type('bodyMedium'), paddingBlock: compact ? 6 : 10 },
          head: { ...type('labelMedium'), fontFamily: fonts.plain, color: s.onSurfaceVariant },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            ...type('labelLarge'),
            textTransform: 'none',
            borderColor: s.outline,
            color: s.onSurface,
            paddingInline: 14,
            '&.Mui-selected': {
              backgroundColor: s.selected,
              color: s.onSelected,
              '&:hover': { backgroundColor: s.selected },
            },
          },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { borderRadius: radius.full },
          firstButton: {
            borderTopLeftRadius: radius.full,
            borderBottomLeftRadius: radius.full,
            paddingLeft: 16,
          },
          lastButton: {
            borderTopRightRadius: radius.full,
            borderBottomRightRadius: radius.full,
            paddingRight: 16,
          },
        },
      },
      MuiSkeleton: {
        defaultProps: { animation: 'wave' },
        styleOverrides: { root: { backgroundColor: s.surfaceContainer } },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { height: 4, borderRadius: 2, backgroundColor: s.surfaceContainerHigh },
          bar: { borderRadius: 2 },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: radius.sm, ...type('bodyMedium') },
          standard: {
            '&.MuiAlert-colorSuccess': {
              backgroundColor: s.status.success.bg,
              color: s.status.success.fg,
            },
            '&.MuiAlert-colorWarning': {
              backgroundColor: s.status.warning.bg,
              color: s.status.warning.fg,
            },
            '&.MuiAlert-colorError': {
              backgroundColor: s.status.error.bg,
              color: s.status.error.fg,
            },
            '&.MuiAlert-colorInfo': { backgroundColor: s.status.info.bg, color: s.status.info.fg },
          },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            backgroundColor: s.surfaceInverse,
            color: s.onSurfaceInverse,
            borderRadius: radius.xs,
            ...type('bodyMedium'),
          },
        },
      },
      MuiDrawer: {
        styleOverrides: { paper: { backgroundColor: s.surface, borderColor: s.outlineVariant } },
      },
      MuiDivider: { styleOverrides: { root: { borderColor: s.divider } } },
      MuiBadge: { styleOverrides: { badge: { fontFamily: fonts.brand, fontWeight: 500 } } },
      MuiAvatar: { styleOverrides: { root: { fontFamily: fonts.brand, fontWeight: 500 } } },
      MuiDataGrid: {
        defaultProps: {
          density: compact ? 'compact' : 'standard',
          disableColumnMenu: false,
          rowHeight: layout.rowHeight[density],
        },
        styleOverrides: {
          root: {
            border: 0,
            backgroundColor: s.surface,
            '--DataGrid-containerBackground': s.surface,
            '--DataGrid-rowBorderColor': s.divider,
            fontFamily: fonts.plain,
            fontSize: '0.875rem',
          },
          columnHeaders: { borderBottom: `1px solid ${s.outlineVariant}` },
          columnHeader: {
            color: s.onSurfaceVariant,
            '&:focus, &:focus-within': { outline: 'none' },
          },
          columnHeaderTitle: { fontWeight: 500, fontSize: '0.75rem' },
          cell: {
            borderColor: s.divider,
            fontVariantNumeric: 'tabular-nums',
            '&:focus, &:focus-within': { outline: `2px solid ${s.focusRing}`, outlineOffset: -2 },
          },
          row: {
            '&:hover': { backgroundColor: s.surfaceContainer },
            '&.Mui-selected': {
              backgroundColor: s.selected,
              '&:hover': { backgroundColor: s.selected },
            },
          },
          footerContainer: { borderTop: `1px solid ${s.divider}` },
          withBorderColor: { borderColor: s.divider },
        },
      },
    },
  });

  cache.set(key, theme);
  return theme;
}
