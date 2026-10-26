import { describe, expect, it } from 'vitest';
import { buildTokenStylesheet, colorVariables } from './css-variables';
import { colorSchemes } from './tokens';

/** WCAG 2 relative luminance contrast for opaque hex colors. */
function contrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ];
    const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  };
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

describe('design tokens', () => {
  it.each(['light', 'dark'] as const)('%s text roles meet WCAG AA (4.5:1) on surface', (mode) => {
    const scheme = colorSchemes[mode];
    for (const role of [
      'onSurface',
      'onSurfaceVariant',
      'onSurfaceMuted',
      'primary',
      'positive',
      'negative',
    ] as const) {
      expect(contrast(scheme[role], scheme.surface), `${mode}.${role}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(scheme.onPrimary, scheme.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(scheme.onSelected, scheme.selected)).toBeGreaterThanOrEqual(4.5);
  });

  it('light status chips meet WCAG AA', () => {
    for (const [name, { fg, bg }] of Object.entries(colorSchemes.light.status)) {
      expect(contrast(fg, bg), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps eight categorical chart slots per mode', () => {
    expect(colorSchemes.light.chart.series).toHaveLength(8);
    expect(colorSchemes.dark.chart.series).toHaveLength(8);
  });

  it('emits CSS variables for every color role', () => {
    const vars = colorVariables(colorSchemes.light);
    expect(vars['--mrd-color-primary']).toBe('#0b57d0');
    expect(vars['--mrd-status-error-fg']).toBe('#b3261e');
    expect(vars['--mrd-chart-series-1']).toBe('#1a73e8');
    const css = buildTokenStylesheet();
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain('prefers-color-scheme: dark');
  });
});
