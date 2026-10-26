import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import { Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly compact?: boolean;
}

/** Nothing to show (yet): says why, and what the user can do about it. */
export function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <Stack
      spacing={1}
      sx={{
        alignItems: 'center',
        textAlign: 'center',
        py: compact ? 3 : 8,
        px: 3,
        color: 'text.secondary',
      }}
    >
      {icon && (
        <Box sx={{ color: 'text.disabled', '& svg': { fontSize: compact ? 32 : 48 } }}>{icon}</Box>
      )}
      <Typography variant="h5" color="text.primary">
        {title}
      </Typography>
      {description && (
        <Typography variant="body1" sx={{ maxWidth: 440 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ pt: 1 }}>{action}</Box>}
    </Stack>
  );
}

export interface ErrorStateProps {
  readonly title?: ReactNode;
  readonly message?: ReactNode;
  readonly onRetry?: () => void;
  readonly detail?: string;
  readonly compact?: boolean;
}

/** Recoverable failure: explains what failed, offers a retry, exposes a trace for support. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  detail,
  compact = false,
}: ErrorStateProps) {
  return (
    <EmptyState
      compact={compact}
      icon={<ErrorOutlineOutlined color="error" />}
      title={title}
      description={
        <>
          {message}
          {detail && (
            <Typography
              component="span"
              variant="body2"
              sx={{ display: 'block', mt: 1, fontFamily: 'monospace', color: 'text.disabled' }}
            >
              {detail}
            </Typography>
          )}
        </>
      }
      action={
        onRetry && (
          <Button variant="outlined" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    />
  );
}

export interface ListSkeletonProps {
  readonly rows?: number;
  /** Height of one placeholder row, in px. */
  readonly rowHeight?: number;
}

/** Placeholder rows for a list that is still loading, sized like the rows that will replace them. */
export function ListSkeleton({ rows = 3, rowHeight = 40 }: ListSkeletonProps) {
  return (
    <Box aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <Box key={index} sx={{ px: 2.5, py: 1.25 }}>
          <Skeleton variant="rounded" height={rowHeight} />
        </Box>
      ))}
    </Box>
  );
}
