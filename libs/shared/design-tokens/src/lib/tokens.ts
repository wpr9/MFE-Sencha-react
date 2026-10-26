/**
 * Meridian design tokens - the single source of truth for every UI layer:
 * the MUI theme (React shell and remotes) is built from these values, and the
 * Ext JS remote consumes the same values as CSS custom properties.
 *
 * Visual language: Google Material 3 as used by Google Cloud console and
 * Workspace (tonal surfaces, Google Sans / Roboto, restrained elevation).
 */

export type ColorMode = 'light' | 'dark';

export interface StatusColors {
  readonly fg: string;
  readonly bg: string;
}

export interface ColorScheme {
  /** App frame behind the header, navigation and content panel. */
  readonly background: string;
  /** Content panel, cards, menus. */
  readonly surface: string;
  /** Table headers, read-only fields. */
  readonly surfaceDim: string;
  readonly surfaceContainer: string;
  readonly surfaceContainerHigh: string;
  readonly surfaceInverse: string;
  readonly onSurface: string;
  readonly onSurfaceVariant: string;
  readonly onSurfaceMuted: string;
  readonly onSurfaceInverse: string;
  readonly outline: string;
  readonly outlineVariant: string;
  readonly divider: string;
  readonly primary: string;
  readonly primaryHover: string;
  readonly onPrimary: string;
  readonly primaryContainer: string;
  readonly onPrimaryContainer: string;
  readonly selected: string;
  readonly onSelected: string;
  readonly hoverOverlay: string;
  readonly pressedOverlay: string;
  readonly focusRing: string;
  readonly scrim: string;
  /** P&L / delta text (always paired with a sign or arrow, never colour alone). */
  readonly positive: string;
  readonly negative: string;
  /** Reserved status scale (chips, banners); always paired with icon + label. */
  readonly status: {
    readonly success: StatusColors;
    readonly warning: StatusColors;
    readonly error: StatusColors;
    readonly info: StatusColors;
    readonly neutral: StatusColors;
  };
  /** Order side tags (Buy/Sell) - deliberately not the P&L red/green. */
  readonly trade: {
    readonly buy: StatusColors;
    readonly sell: StatusColors;
  };
  readonly chart: {
    /**
     * Categorical slots in fixed order - validated (lightness band, chroma,
     * CVD + normal-vision separation, contrast) against `surface` with the
     * dataviz palette validator. Assign in order; never cycle past 8.
     */
    readonly series: readonly [string, string, string, string, string, string, string, string];
    /** De-emphasis ink for context series (e.g. benchmark). */
    readonly context: string;
    readonly grid: string;
    readonly axis: string;
    readonly flashUp: string;
    readonly flashDown: string;
  };
}

export const colorSchemes: Readonly<Record<ColorMode, ColorScheme>> = {
  light: {
    background: '#f8fafd',
    surface: '#ffffff',
    surfaceDim: '#f8f9fa',
    surfaceContainer: '#f0f4f9',
    surfaceContainerHigh: '#e9eef6',
    surfaceInverse: '#303134',
    onSurface: '#1f1f1f',
    onSurfaceVariant: '#444746',
    onSurfaceMuted: '#5f6368',
    onSurfaceInverse: '#f2f2f2',
    outline: '#747775',
    outlineVariant: '#dadce0',
    divider: '#e8eaed',
    primary: '#0b57d0',
    primaryHover: '#0842a0',
    onPrimary: '#ffffff',
    primaryContainer: '#d3e3fd',
    onPrimaryContainer: '#041e49',
    selected: '#d3e3fd',
    onSelected: '#041e49',
    hoverOverlay: 'rgba(31, 31, 31, 0.06)',
    pressedOverlay: 'rgba(31, 31, 31, 0.1)',
    focusRing: '#0b57d0',
    scrim: 'rgba(32, 33, 36, 0.4)',
    positive: '#137333',
    negative: '#b3261e',
    status: {
      success: { fg: '#146c2e', bg: '#e6f4ea' },
      warning: { fg: '#8f4c00', bg: '#fef7e0' },
      error: { fg: '#b3261e', bg: '#fce8e6' },
      info: { fg: '#0b57d0', bg: '#e8f0fe' },
      neutral: { fg: '#444746', bg: '#f1f3f4' },
    },
    trade: {
      buy: { fg: '#0b57d0', bg: '#e8f0fe' },
      sell: { fg: '#9c1d63', bg: '#fde7f3' },
    },
    chart: {
      series: [
        '#1a73e8',
        '#e8710a',
        '#129eaf',
        '#f29900',
        '#e52592',
        '#1e8e3e',
        '#9334e6',
        '#d93025',
      ],
      context: '#9aa0a6',
      grid: '#e8eaed',
      axis: '#dadce0',
      flashUp: 'rgba(30, 142, 62, 0.16)',
      flashDown: 'rgba(217, 48, 37, 0.14)',
    },
  },
  dark: {
    background: '#131314',
    surface: '#1e1f20',
    surfaceDim: '#232426',
    surfaceContainer: '#282a2c',
    surfaceContainerHigh: '#333537',
    surfaceInverse: '#e3e3e3',
    onSurface: '#e3e3e3',
    onSurfaceVariant: '#c4c7c5',
    onSurfaceMuted: '#9aa0a6',
    onSurfaceInverse: '#1f1f1f',
    outline: '#8e918f',
    outlineVariant: '#444746',
    divider: '#3c4043',
    primary: '#a8c7fa',
    primaryHover: '#d3e3fd',
    onPrimary: '#062e6f',
    primaryContainer: '#0842a0',
    onPrimaryContainer: '#d3e3fd',
    selected: '#004a77',
    onSelected: '#c2e7ff',
    hoverOverlay: 'rgba(227, 227, 227, 0.08)',
    pressedOverlay: 'rgba(227, 227, 227, 0.12)',
    focusRing: '#a8c7fa',
    scrim: 'rgba(0, 0, 0, 0.6)',
    positive: '#6dd58c',
    negative: '#f2b8b5',
    status: {
      success: { fg: '#6dd58c', bg: 'rgba(109, 213, 140, 0.14)' },
      warning: { fg: '#fdd663', bg: 'rgba(253, 214, 99, 0.14)' },
      error: { fg: '#f2b8b5', bg: 'rgba(242, 184, 181, 0.14)' },
      info: { fg: '#a8c7fa', bg: 'rgba(168, 199, 250, 0.14)' },
      neutral: { fg: '#c4c7c5', bg: 'rgba(196, 199, 197, 0.12)' },
    },
    trade: {
      buy: { fg: '#a8c7fa', bg: 'rgba(168, 199, 250, 0.14)' },
      sell: { fg: '#ffaed8', bg: 'rgba(255, 174, 216, 0.14)' },
    },
    chart: {
      series: [
        '#4285f4',
        '#d9650a',
        '#12a4af',
        '#c98500',
        '#e52592',
        '#1e8e3e',
        '#a142f4',
        '#e15b52',
      ],
      context: '#80868b',
      grid: '#3c4043',
      axis: '#5f6368',
      flashUp: 'rgba(109, 213, 140, 0.22)',
      flashDown: 'rgba(242, 184, 181, 0.22)',
    },
  },
};

export const typography = {
  fontFamily: {
    /** Display, headings, navigation, buttons, chips. */
    brand:
      '"Google Sans Variable", "Google Sans", "Roboto Variable", Roboto, system-ui, sans-serif',
    /** Body copy and data. */
    plain: '"Roboto Variable", Roboto, "Segoe UI", system-ui, -apple-system, sans-serif',
    mono: '"Roboto Mono Variable", "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  /** Material 3 type scale (px). */
  scale: {
    displaySmall: { size: 36, lineHeight: 44, weight: 400, family: 'brand' },
    headlineMedium: { size: 28, lineHeight: 36, weight: 400, family: 'brand' },
    headlineSmall: { size: 24, lineHeight: 32, weight: 400, family: 'brand' },
    titleLarge: { size: 22, lineHeight: 28, weight: 400, family: 'brand' },
    titleMedium: { size: 16, lineHeight: 24, weight: 500, family: 'brand' },
    titleSmall: { size: 14, lineHeight: 20, weight: 500, family: 'brand' },
    bodyLarge: { size: 16, lineHeight: 24, weight: 400, family: 'plain' },
    bodyMedium: { size: 14, lineHeight: 20, weight: 400, family: 'plain' },
    bodySmall: { size: 12, lineHeight: 16, weight: 400, family: 'plain' },
    labelLarge: { size: 14, lineHeight: 20, weight: 500, family: 'brand' },
    labelMedium: { size: 12, lineHeight: 16, weight: 500, family: 'brand' },
    labelSmall: { size: 11, lineHeight: 16, weight: 500, family: 'brand' },
  },
} as const;

export type TypeRole = keyof typeof typography.scale;

/** 4px grid. */
export const spacing = (steps: number): number => steps * 4;

export const radius = { xs: 4, sm: 8, md: 12, lg: 16, xl: 28, full: 9999 } as const;

export const elevation: Readonly<Record<ColorMode, readonly [string, string, string, string]>> = {
  light: [
    'none',
    '0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15)',
    '0 1px 2px 0 rgba(60, 64, 67, 0.3), 0 2px 6px 2px rgba(60, 64, 67, 0.15)',
    '0 1px 3px 0 rgba(60, 64, 67, 0.3), 0 4px 8px 3px rgba(60, 64, 67, 0.15)',
  ],
  dark: [
    'none',
    '0 1px 2px 0 rgba(0, 0, 0, 0.6), 0 1px 3px 1px rgba(0, 0, 0, 0.3)',
    '0 1px 2px 0 rgba(0, 0, 0, 0.6), 0 2px 6px 2px rgba(0, 0, 0, 0.3)',
    '0 1px 3px 0 rgba(0, 0, 0, 0.6), 0 4px 8px 3px rgba(0, 0, 0, 0.3)',
  ],
};

export const motion = {
  duration: { short: 100, medium: 200, long: 300, flash: 900 },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    decelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
    accelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
  },
} as const;

export const layout = {
  appBarHeight: 64,
  navWidth: 256,
  navRailWidth: 72,
  contentMaxWidth: 1600,
  /** Row heights for data grids by density. */
  rowHeight: { comfortable: 44, compact: 32 },
  /** Grid rows with a second line (e.g. a name under the symbol). */
  twoLineRowHeight: { comfortable: 56, compact: 44 },
} as const;

export const zIndex = {
  appBar: 1100,
  drawer: 1200,
  modal: 1300,
  snackbar: 1400,
  tooltip: 1500,
} as const;
