import {
  colorSchemes,
  elevation,
  layout,
  motion,
  radius,
  typography,
  type ColorMode,
  type ColorScheme,
} from './tokens';

/**
 * CSS custom properties derived from the tokens. Non-React surfaces (the Ext
 * JS remote, the dev host, the BFF sign-in page) style themselves against
 * these variables, so they follow theme changes with zero JavaScript.
 */
export const CSS_VARIABLE_PREFIX = '--mrd';

const kebab = (value: string) => value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

export function colorVariables(scheme: ColorScheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(scheme)) {
    if (typeof value === 'string') vars[`${CSS_VARIABLE_PREFIX}-color-${kebab(key)}`] = value;
  }
  for (const [name, { fg, bg }] of Object.entries(scheme.status)) {
    vars[`${CSS_VARIABLE_PREFIX}-status-${name}-fg`] = fg;
    vars[`${CSS_VARIABLE_PREFIX}-status-${name}-bg`] = bg;
  }
  for (const [side, { fg, bg }] of Object.entries(scheme.trade)) {
    vars[`${CSS_VARIABLE_PREFIX}-trade-${side}-fg`] = fg;
    vars[`${CSS_VARIABLE_PREFIX}-trade-${side}-bg`] = bg;
  }
  scheme.chart.series.forEach((color, index) => {
    vars[`${CSS_VARIABLE_PREFIX}-chart-series-${index + 1}`] = color;
  });
  for (const key of ['context', 'grid', 'axis', 'flashUp', 'flashDown'] as const) {
    vars[`${CSS_VARIABLE_PREFIX}-chart-${kebab(key)}`] = scheme.chart[key];
  }
  return vars;
}

export function staticVariables(mode: ColorMode): Record<string, string> {
  const vars: Record<string, string> = {
    [`${CSS_VARIABLE_PREFIX}-font-brand`]: typography.fontFamily.brand,
    [`${CSS_VARIABLE_PREFIX}-font-plain`]: typography.fontFamily.plain,
    [`${CSS_VARIABLE_PREFIX}-font-mono`]: typography.fontFamily.mono,
    [`${CSS_VARIABLE_PREFIX}-easing-standard`]: motion.easing.standard,
    [`${CSS_VARIABLE_PREFIX}-duration-short`]: `${motion.duration.short}ms`,
    [`${CSS_VARIABLE_PREFIX}-duration-medium`]: `${motion.duration.medium}ms`,
    [`${CSS_VARIABLE_PREFIX}-duration-flash`]: `${motion.duration.flash}ms`,
    [`${CSS_VARIABLE_PREFIX}-row-height-comfortable`]: `${layout.rowHeight.comfortable}px`,
    [`${CSS_VARIABLE_PREFIX}-row-height-compact`]: `${layout.rowHeight.compact}px`,
  };
  for (const [key, value] of Object.entries(radius)) {
    vars[`${CSS_VARIABLE_PREFIX}-radius-${key}`] = `${value}px`;
  }
  elevation[mode].forEach((shadow, level) => {
    vars[`${CSS_VARIABLE_PREFIX}-elevation-${level}`] = shadow;
  });
  for (const [role, spec] of Object.entries(typography.scale)) {
    vars[`${CSS_VARIABLE_PREFIX}-type-${kebab(role)}`] =
      `${spec.weight} ${spec.size}px/${spec.lineHeight}px ${typography.fontFamily[spec.family]}`;
  }
  return vars;
}

function block(selector: string, mode: ColorMode): string {
  const vars = { ...colorVariables(colorSchemes[mode]), ...staticVariables(mode) };
  const body = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `${selector} {\n  color-scheme: ${mode};\n${body}\n}`;
}

/**
 * Full stylesheet: light by default, dark when the shell stamps
 * `data-theme="dark"` on <html>, and dark under `prefers-color-scheme` for
 * pages that never stamp a theme (the sign-in page).
 */
export function buildTokenStylesheet(): string {
  return [
    block(':root', 'light'),
    `@media (prefers-color-scheme: dark) {\n${block(':root:where(:not([data-theme="light"]))', 'dark')}\n}`,
    block(':root[data-theme="dark"]', 'dark'),
  ].join('\n\n');
}

/** Idempotently installs the token stylesheet into a document. */
export function installTokenStylesheet(doc: Document = document): HTMLStyleElement {
  const id = 'mrd-design-tokens';
  const existing = doc.getElementById(id);
  if (existing instanceof HTMLStyleElement) return existing;
  const style = doc.createElement('style');
  style.id = id;
  style.textContent = buildTokenStylesheet();
  doc.head.prepend(style);
  return style;
}
