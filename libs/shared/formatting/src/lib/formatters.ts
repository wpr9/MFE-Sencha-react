/**
 * Locale-aware formatting shared by every frontend (React and Ext JS) so that
 * a number looks identical wherever it is rendered.
 *
 * `Intl.*Format` construction is comparatively expensive, and grids render
 * thousands of cells, so formatter instances are memoised per locale+options.
 */

export const DEFAULT_LOCALE = 'en-US';

export type Trend = 'up' | 'down' | 'flat';

export interface LocaleOptions {
  readonly locale?: string;
}

export interface CurrencyOptions extends LocaleOptions {
  readonly currency?: string;
  readonly compact?: boolean;
  /** `always` renders +/- for P&L columns. */
  readonly signDisplay?: 'auto' | 'always' | 'exceptZero';
  readonly maximumFractionDigits?: number;
}

export interface NumberOptions extends LocaleOptions {
  readonly minimumFractionDigits?: number;
  readonly maximumFractionDigits?: number;
  readonly signDisplay?: 'auto' | 'always' | 'exceptZero';
  readonly compact?: boolean;
}

const numberFormatCache = new Map<string, Intl.NumberFormat>();
const dateFormatCache = new Map<string, Intl.DateTimeFormat>();
const relativeFormatCache = new Map<string, Intl.RelativeTimeFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormatCache.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormatCache.set(key, format);
  }
  return format;
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormatCache.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormatCache.set(key, format);
  }
  return format;
}

const EM_DASH = '—';

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatCurrency(
  value: number | null | undefined,
  options: CurrencyOptions = {},
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  const {
    locale = DEFAULT_LOCALE,
    currency = 'USD',
    compact = false,
    signDisplay = 'auto',
  } = options;
  return numberFormat(locale, {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    signDisplay,
    maximumFractionDigits: options.maximumFractionDigits ?? (compact ? 1 : 2),
    minimumFractionDigits: compact ? 0 : Math.min(2, options.maximumFractionDigits ?? 2),
  }).format(value);
}

export function formatNumber(
  value: number | null | undefined,
  options: NumberOptions = {},
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  const { locale = DEFAULT_LOCALE, compact = false, signDisplay = 'auto' } = options;
  return numberFormat(locale, {
    notation: compact ? 'compact' : 'standard',
    signDisplay,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? (compact ? 1 : 2),
  }).format(value);
}

/** Whole-unit quantities (shares). */
export function formatQuantity(
  value: number | null | undefined,
  options: LocaleOptions = {},
): string {
  return formatNumber(value, { ...options, maximumFractionDigits: 0 });
}

/** Prices keep 2 decimals; sub-dollar instruments get 4. */
export function formatPrice(value: number | null | undefined, options: LocaleOptions = {}): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  const digits = Math.abs(value) < 1 ? 4 : 2;
  return formatNumber(value, {
    ...options,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Formats a value expressed in percent units (`1.25` renders `1.25%`).
 * Using percent units end-to-end avoids x100 bugs at API boundaries.
 */
export function formatPercent(
  value: number | null | undefined,
  options: LocaleOptions & {
    readonly decimals?: number;
    readonly signDisplay?: 'auto' | 'always' | 'exceptZero';
  } = {},
): string {
  if (!isFiniteNumber(value)) return EM_DASH;
  const { locale = DEFAULT_LOCALE, decimals = 2, signDisplay = 'auto' } = options;
  return numberFormat(locale, {
    style: 'percent',
    signDisplay,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

export function formatSignedPercent(
  value: number | null | undefined,
  options: LocaleOptions & { readonly decimals?: number } = {},
): string {
  return formatPercent(value, { ...options, signDisplay: 'exceptZero' });
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a value for display. A date-only string (`2026-10-23`) is a calendar
 * date, so it becomes local midnight: `new Date('2026-10-23')` is UTC midnight
 * and would display as the previous day for every user west of UTC.
 */
export function parseDate(value: string | number | Date): Date {
  if (value instanceof Date) return value;
  return typeof value === 'string' && DATE_ONLY.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  options: LocaleOptions & {
    readonly timeZone?: string;
    readonly style?: 'short' | 'medium' | 'time' | 'shortTime' | 'date' | 'shortDate';
  } = {},
): string {
  if (value === null || value === undefined) return EM_DASH;
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  const { locale = DEFAULT_LOCALE, timeZone, style = 'short' } = options;
  const presets: Record<NonNullable<typeof style>, Intl.DateTimeFormatOptions> = {
    short: { dateStyle: 'medium', timeStyle: 'short' },
    medium: { dateStyle: 'medium', timeStyle: 'medium' },
    time: { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' },
    /** Axis ticks and dense tables: HH:MM. */
    shortTime: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    date: { dateStyle: 'medium' },
    /** Axis ticks: `Oct 23`. */
    shortDate: { month: 'short', day: 'numeric' },
  };
  return dateFormat(locale, { ...presets[style], timeZone }).format(date);
}

const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

export function formatRelativeTime(
  value: string | number | Date,
  options: LocaleOptions & { readonly now?: number } = {},
): string {
  const { locale = DEFAULT_LOCALE, now = Date.now() } = options;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(time)) return EM_DASH;
  const deltaSeconds = Math.round((time - now) / 1000);
  let format = relativeFormatCache.get(locale);
  if (!format) {
    format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    relativeFormatCache.set(locale, format);
  }
  if (Math.abs(deltaSeconds) < 10) return format.format(0, 'second'); // "now", localised
  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (Math.abs(deltaSeconds) >= seconds || unit === 'second') {
      return format.format(Math.round(deltaSeconds / seconds), unit);
    }
  }
  return EM_DASH;
}

export function trendOf(value: number | null | undefined, epsilon = 1e-9): Trend {
  if (!isFiniteNumber(value) || Math.abs(value) < epsilon) return 'flat';
  return value > 0 ? 'up' : 'down';
}
