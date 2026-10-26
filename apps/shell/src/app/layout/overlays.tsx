import TimerOutlined from '@mui/icons-material/TimerOutlined';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  Snackbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import { useState } from 'react';
import { RemoteOutlet } from '../components/RemoteOutlet';
import { WIDGET_MODULES } from '../modules';
import { useNotificationCenter, usePlatform, useSessionState } from '../platform-context';
import { useShellUi } from '../ui-store';
import { useRunAction } from './menus';

/** Errors stay a little longer; everything else follows the Material default. */
const TOAST_DURATION_MS = { error: 8_000, warning: 5_000, success: 5_000, info: 5_000 } as const;

/** One snackbar at a time, bottom-left (Google Material convention). */
export function Toaster() {
  const { toasts } = useNotificationCenter();
  const toast = toasts[0];
  // Keyed per toast: each one gets fresh open/close state.
  return toast ? <ToastSnackbar key={toast.id} toast={toast} /> : null;
}

function ToastSnackbar({
  toast,
}: {
  readonly toast: ReturnType<typeof useNotificationCenter>['toasts'][number];
}) {
  const platform = usePlatform();
  const runAction = useRunAction();
  const [open, setOpen] = useState(true);
  const dismiss = () => setOpen(false);
  return (
    <Snackbar
      open={open}
      onClose={(_, reason) => reason !== 'clickaway' && dismiss()}
      autoHideDuration={toast.durationMs ?? TOAST_DURATION_MS[toast.severity]}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ transition: { onExited: () => platform.notifications.dismissToast(toast.id) } }}
      message={toast.message}
      action={
        <>
          {toast.action && (
            <Button
              size="small"
              sx={{ color: 'var(--mrd-color-primary-container)' }}
              onClick={() => {
                runAction(toast.action);
                dismiss();
              }}
            >
              {toast.action.label}
            </Button>
          )}
          <IconButton size="small" aria-label="Dismiss" onClick={dismiss} sx={{ color: 'inherit' }}>
            <CloseOutlined fontSize="small" />
          </IconButton>
        </>
      }
    />
  );
}

const mmss = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Session warnings and expiry - the BFF enforces both timeouts; this keeps the UI honest.
 * The idle timeout can be extended by the user; the absolute limit (maximum session
 * length) cannot, so it gets its own wording, an earlier warning and no "stay" option.
 */
export function SessionDialogs() {
  const { session } = usePlatform();
  const state = useSessionState();
  const [busy, setBusy] = useState(false);
  const [dismissedDeadline, setDismissedDeadline] = useState<string | null>(null);
  const countdown = (
    <Box component="strong" sx={{ color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
      {mmss(state.remainingMs)}
    </Box>
  );
  if (state.phase === 'expiring' && state.limit === 'absolute') {
    if (dismissedDeadline === state.session.absoluteExpiresAt) return null;
    const hours = Math.round(
      (Date.parse(state.session.absoluteExpiresAt) - Date.parse(state.session.issuedAt)) /
        3_600_000,
    );
    return (
      // May open over a remote's dialog, whose MUI focus trap the shell cannot see (ADR-0002).
      <Dialog
        open
        disableEnforceFocus
        aria-labelledby="session-ending-title"
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle
          id="session-ending-title"
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
        >
          <TimerOutlined color="warning" /> Session ending soon
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" color="text.secondary">
            For your security, a session lasts at most {hours} hours. You will be signed out in{' '}
            {countdown}. Finish what you are doing, or sign in again now to start a new session.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDismissedDeadline(state.session.absoluteExpiresAt)}>
            Continue
          </Button>
          <Button variant="contained" onClick={() => void session.signOut()}>
            Sign in again
          </Button>
        </DialogActions>
      </Dialog>
    );
  }
  if (state.phase === 'expiring') {
    return (
      // May open over a remote's dialog, whose MUI focus trap the shell cannot see (ADR-0002).
      <Dialog
        open
        disableEnforceFocus
        aria-labelledby="session-expiring-title"
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle
          id="session-expiring-title"
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
        >
          <TimerOutlined color="warning" /> Still there?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" color="text.secondary">
            For your security you will be signed out in {countdown} because of inactivity. Unsaved
            order tickets will be lost.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void session.signOut()}>Sign out</Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void session.keepAlive().finally(() => setBusy(false));
            }}
          >
            Stay signed in
          </Button>
        </DialogActions>
      </Dialog>
    );
  }
  if (state.phase === 'expired') {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    return (
      <Dialog
        open
        disableEnforceFocus
        aria-labelledby="session-expired-title"
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle id="session-expired-title">Session expired</DialogTitle>
        <DialogContent>
          <Typography variant="body1" color="text.secondary">
            Your session ended. Sign in again to continue where you left off.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => window.location.assign(`${session.loginUrl(returnTo)}&expired=1`)}
          >
            Sign in again
          </Button>
        </DialogActions>
      </Dialog>
    );
  }
  return null;
}

/** Side sheet hosting the trading remote's order ticket widget. */
export function TradeTicketDrawer() {
  const ticket = useShellUi((state) => state.ticket);
  const closeTicket = useShellUi((state) => state.closeTicket);
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  return (
    <Drawer
      anchor="right"
      open={ticket.open}
      onClose={closeTicket}
      // The ticket is another remote with its own MUI (ADR-0002): its menus portal to
      // <body>, outside this drawer, under their own focus trap. Two traps from two MUI
      // instances fight over every focusin (stack overflow), so the shell - which does
      // not own the content - stops enforcing focus. aria-modal and the backdrop remain.
      ModalProps={{ disableEnforceFocus: true }}
      slotProps={{
        paper: {
          sx: {
            width: fullScreen ? '100%' : 460,
            borderRadius: fullScreen ? 0 : '16px 0 0 16px',
            overflow: 'hidden',
          },
          'aria-label': 'Order ticket',
        },
      }}
    >
      {ticket.open && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <RemoteOutlet
            key={ticket.key}
            {...WIDGET_MODULES.orderTicket}
            label="Order ticket"
            variant="embedded"
            props={ticket.draft}
            onClose={closeTicket}
          />
        </Box>
      )}
    </Drawer>
  );
}
