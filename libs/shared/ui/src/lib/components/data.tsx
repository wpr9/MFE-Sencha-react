import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import {
  Box,
  Skeleton,
  Stack,
  Typography,
  useTheme,
  type SxProps,
  type Theme,
} from '@mui/material';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import { motion } from '@meridian/design-tokens';
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

/** Semantic status scale; maps to the reserved status colours (never reused for data series). */
export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const TONE_ICON: Record<Tone, ReactElement> = {
  success: <CheckCircleOutlined />,
  warning: <WarningAmberOutlined />,
  error: <ErrorOutlineOutlined />,
  info: <InfoOutlined />,
  neutral: <InfoOutlined />,
};

export interface StatusChipProps {
  readonly tone: Tone;
  readonly label: ReactNode;
  readonly icon?: ReactElement | null;
  readonly size?: 'small' | 'medium';
}

/** Status is never colour alone: every chip carries an icon and a label. */
export function StatusChip({ tone, label, icon, size = 'small' }: StatusChipProps) {
  const { scheme } = useTheme().meridian;
  const colors = scheme.status[tone];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: size === 'small' ? 24 : 28,
        pl: 1,
        pr: 1.25,
        borderRadius: 2,
        bgcolor: colors.bg,
        color: colors.fg,
        typography: 'subtitle2',
        fontSize: '0.75rem',
        lineHeight: '16px',
        whiteSpace: 'nowrap',
        '& svg': { fontSize: 16 },
      }}
    >
      {icon === null ? null : (icon ?? TONE_ICON[tone])}
      {label}
    </Box>
  );
}

export interface TrendTextProps {
  readonly value: number | null | undefined;
  readonly children: ReactNode;
  /** Whether an increase is good (P&L) or bad (risk, cost). */
  readonly upIsGood?: boolean;
  readonly showIcon?: boolean;
  readonly sx?: SxProps<Theme>;
}

/** Signed delta: colour plus arrow, so direction never relies on colour alone. */
export function TrendText({
  value,
  children,
  upIsGood = true,
  showIcon = true,
  sx,
}: TrendTextProps) {
  const { scheme } = useTheme().meridian;
  const direction =
    value === null || value === undefined || Math.abs(value) < 1e-9 ? 0 : Math.sign(value);
  const good = direction === 0 ? null : direction > 0 === upIsGood;
  const color = good === null ? scheme.onSurfaceVariant : good ? scheme.positive : scheme.negative;
  const Icon =
    direction > 0 ? ArrowUpwardRounded : direction < 0 ? ArrowDownwardRounded : RemoveRounded;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
        color,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      {showIcon && <Icon sx={{ fontSize: '1.05em' }} aria-hidden />}
      {children}
    </Box>
  );
}

export interface StatTileProps {
  readonly label: string;
  readonly value: ReactNode;
  readonly delta?: ReactNode;
  readonly deltaValue?: number | null;
  readonly deltaLabel?: string;
  readonly upIsGood?: boolean;
  /** Recent history, oldest first; drawn in the de-emphasis hue. */
  readonly trend?: readonly number[];
  readonly loading?: boolean;
  /** The one hero figure per view (>= 48px). */
  readonly hero?: boolean;
}

/** Labelled figure with an optional delta and sparkline; the building block of KPI rows. */
export function StatTile({
  label,
  value,
  delta,
  deltaValue,
  deltaLabel,
  upIsGood,
  trend,
  loading,
  hero = false,
}: StatTileProps) {
  const theme = useTheme();
  const { scheme } = theme.meridian;
  return (
    <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography variant="body1" color="text.secondary" noWrap>
        {label}
      </Typography>
      {loading ? (
        <Skeleton variant="text" sx={{ fontSize: hero ? 48 : 28, width: '70%' }} />
      ) : (
        <Typography
          component="p"
          sx={{
            fontFamily: theme.typography.h1.fontFamily,
            fontWeight: 500,
            fontSize: hero ? '3rem' : '1.75rem',
            lineHeight: hero ? '56px' : '36px',
            letterSpacing: hero ? '-0.5px' : 0,
            m: 0,
          }}
        >
          {value}
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 20 }}>
        {loading ? (
          <Skeleton variant="text" width={96} />
        ) : (
          delta !== undefined && (
            <>
              <TrendText value={deltaValue} upIsGood={upIsGood}>
                {delta}
              </TrendText>
              {deltaLabel && (
                <Typography variant="body2" color="text.secondary" noWrap>
                  {deltaLabel}
                </Typography>
              )}
            </>
          )
        )}
      </Stack>
      {trend && trend.length > 1 && !loading && (
        <Box sx={{ height: 32, mt: 0.5 }} aria-hidden>
          <SparkLineChart
            data={[...trend]}
            height={32}
            curve="natural"
            color={scheme.chart.series[0]}
            area
          />
        </Box>
      )}
    </Box>
  );
}

export interface MeterProps {
  readonly value: number;
  readonly max?: number;
  readonly status: 'ok' | 'warning' | 'breach';
  readonly label?: string;
}

/** Utilisation meter: fill carries severity, the track is a lighter step of the same family. */
export function Meter({ value, max = 100, status, label }: MeterProps) {
  const { scheme } = useTheme().meridian;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill =
    status === 'breach'
      ? scheme.status.error.fg
      : status === 'warning'
        ? scheme.status.warning.fg
        : scheme.primary;
  const track =
    status === 'breach'
      ? scheme.status.error.bg
      : status === 'warning'
        ? scheme.status.warning.bg
        : scheme.primaryContainer;
  return (
    <Box
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      sx={{ height: 6, borderRadius: 3, bgcolor: track, overflow: 'hidden' }}
    >
      <Box
        sx={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 3,
          bgcolor: fill,
          transition: 'width 300ms cubic-bezier(0.2, 0, 0, 1)',
        }}
      />
    </Box>
  );
}

/** Connection state of the shared real-time stream, as a dot plus a word (never colour alone). */
export function LiveIndicator({
  status,
}: {
  readonly status: 'connecting' | 'open' | 'reconnecting' | 'offline';
}) {
  const { scheme } = useTheme().meridian;
  const label =
    status === 'open'
      ? 'Live'
      : status === 'offline'
        ? 'Offline'
        : status === 'connecting'
          ? 'Connecting'
          : 'Reconnecting';
  const color =
    status === 'open'
      ? scheme.status.success.fg
      : status === 'offline'
        ? scheme.onSurfaceMuted
        : scheme.status.warning.fg;
  return (
    <Box
      component="span"
      role="status"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        typography: 'subtitle2',
        fontSize: '0.75rem',
        color: 'text.secondary',
      }}
    >
      <Box
        component="span"
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: color,
          boxShadow: status === 'open' ? `0 0 0 4px ${scheme.status.success.bg}` : 'none',
        }}
      />
      {label}
    </Box>
  );
}

export interface FlashValueProps {
  /** The number being shown; a change tints the background briefly, up or down. */
  readonly value: number | null | undefined;
  readonly children: ReactNode;
}

/**
 * Live-value cell: on each change the background flashes in the up/down hue
 * and fades, so a glance at a busy grid shows what just moved. The flash is
 * decorative; direction is still carried by the value and any TrendText.
 */
export function FlashValue({ value, children }: FlashValueProps) {
  const { scheme } = useTheme().meridian;
  const previous = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (value == null || before == null || value === before) return undefined;
    setFlash(value > before ? 'up' : 'down');
    const timer = setTimeout(() => setFlash(null), motion.duration.flash);
    return () => clearTimeout(timer);
  }, [value]);
  return (
    <Box
      component="span"
      sx={{
        px: 0.75,
        mx: -0.75,
        borderRadius: 1,
        fontVariantNumeric: 'tabular-nums',
        transition: `background-color ${motion.duration.flash}ms ${motion.easing.standard}`,
        bgcolor:
          flash === 'up'
            ? scheme.chart.flashUp
            : flash === 'down'
              ? scheme.chart.flashDown
              : 'transparent',
      }}
    >
      {children}
    </Box>
  );
}

/** Grid cell with a symbol and its name on a second line (needs a two-line row height). */
export function SecurityCell({ symbol, name }: { readonly symbol: string; readonly name: string }) {
  return (
    <Box sx={{ minWidth: 0, lineHeight: 1.3 }}>
      <Typography variant="subtitle2" noWrap>
        {symbol}
      </Typography>
      <Typography variant="body2" color="text.secondary" noWrap>
        {name}
      </Typography>
    </Box>
  );
}
