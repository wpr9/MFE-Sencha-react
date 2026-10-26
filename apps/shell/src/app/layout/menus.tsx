import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import DoneAllOutlined from '@mui/icons-material/DoneAllOutlined';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import SwitchAccountOutlined from '@mui/icons-material/SwitchAccountOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import {
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { Role, type NotificationAction, type Severity } from '@meridian/contracts';
import { formatRelativeTime } from '@meridian/formatting';
import { EmptyState } from '@meridian/ui';
import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import {
  useNotificationCenter,
  usePlatform,
  useShellHost,
  useShellIntents,
} from '../platform-context';

const ROLE_LABEL: Record<Role, string> = {
  [Role.PortfolioManager]: 'Portfolio manager',
  [Role.Trader]: 'Trader',
  [Role.ComplianceOfficer]: 'Compliance officer',
  [Role.Analyst]: 'Analyst (read-only)',
  [Role.PlatformAdmin]: 'Platform admin',
};

/** Account popover: who is signed in, with what roles, plus settings and sign-out. */
export function AccountMenu({
  anchor,
  onClose,
}: {
  readonly anchor: HTMLElement | null;
  readonly onClose: () => void;
}) {
  const host = useShellHost();
  const navigate = useNavigate();
  const session = host.auth.getSession();
  const { user } = session;
  const go = (path: string) => {
    onClose();
    navigate(path);
  };
  return (
    <Menu
      anchorEl={anchor}
      open={Boolean(anchor)}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { width: 340, mt: 1, borderRadius: 4 } } }}
    >
      <Box
        sx={{
          px: 2.5,
          pt: 2,
          pb: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <Avatar
          sx={{
            width: 64,
            height: 64,
            bgcolor: user.avatarColor,
            color: '#fff',
            fontSize: 24,
            mb: 1,
          }}
        >
          {user.initials}
        </Avatar>
        <Typography variant="h5">{user.name}</Typography>
        <Typography variant="body1" color="text.secondary">
          {user.email}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {user.title}
        </Typography>
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ mt: 1.5, flexWrap: 'wrap', justifyContent: 'center' }}
        >
          {session.roles.map((role) => (
            <Chip key={role} size="small" label={ROLE_LABEL[role]} />
          ))}
          <Chip
            size="small"
            variant="outlined"
            label={session.authMode === 'mock' ? 'Mock SSO' : 'SSO'}
          />
        </Stack>
      </Box>
      <Divider />
      <MenuItem onClick={() => go('/settings')}>
        <ListItemIcon>
          <SettingsOutlined fontSize="small" />
        </ListItemIcon>
        Settings
      </MenuItem>
      <MenuItem onClick={() => go('/platform')}>
        <ListItemIcon>
          <MonitorHeartOutlined fontSize="small" />
        </ListItemIcon>
        Platform diagnostics
      </MenuItem>
      {session.authMode === 'mock' && (
        // The mock IdP's sign-in page is a persona picker: signing out is how you switch.
        <MenuItem
          onClick={() => {
            onClose();
            void host.auth.signOut();
          }}
        >
          <ListItemIcon>
            <SwitchAccountOutlined fontSize="small" />
          </ListItemIcon>
          Switch persona
        </MenuItem>
      )}
      <Divider />
      <MenuItem
        onClick={() => {
          onClose();
          void host.auth.signOut();
        }}
      >
        <ListItemIcon>
          <LogoutOutlined fontSize="small" />
        </ListItemIcon>
        Sign out
      </MenuItem>
    </Menu>
  );
}

export const SEVERITY_ICON: Record<Severity, ReactElement> = {
  success: <CheckCircleOutlined color="success" fontSize="small" />,
  info: <InfoOutlined color="info" fontSize="small" />,
  warning: <WarningAmberOutlined color="warning" fontSize="small" />,
  error: <ErrorOutlineOutlined color="error" fontSize="small" />,
};

/** Runs a notification's action: an intent through the shell, or a plain navigation. */
export function useRunAction() {
  const { dispatchRequest } = useShellIntents();
  const navigate = useNavigate();
  return (action: NotificationAction | undefined) => {
    if (!action) return;
    if (action.intent) dispatchRequest(action.intent);
    else if (action.href) navigate(action.href);
  };
}

/** Bell with unread badge and the notification inbox popover. */
export function NotificationsButton() {
  const platform = usePlatform();
  const { inbox, unread } = useNotificationCenter();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const runAction = useRunAction();
  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          <Badge badgeContent={unread} color="error" max={99}>
            <NotificationsOutlined />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => {
          setAnchor(null);
          platform.notifications.markAllRead();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: 400,
              maxHeight: 520,
              mt: 1,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 4,
            },
          },
        }}
      >
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 1.5 }}
        >
          <Typography variant="h5">Notifications</Typography>
          <Button
            size="small"
            startIcon={<DoneAllOutlined />}
            onClick={() => platform.notifications.markAllRead()}
            disabled={!unread}
          >
            Mark all read
          </Button>
        </Stack>
        <Divider />
        <Box sx={{ overflowY: 'auto' }}>
          {inbox.length === 0 ? (
            <EmptyState
              compact
              icon={<NotificationsNoneOutlined />}
              title="You're all caught up"
              description="Fills, approvals and compliance alerts appear here."
            />
          ) : (
            inbox.map((item) => (
              <Box
                key={item.id}
                component="button"
                onClick={() => {
                  setAnchor(null);
                  runAction(item.action);
                }}
                sx={{
                  all: 'unset',
                  boxSizing: 'border-box',
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr',
                  gap: 1.5,
                  px: 2.5,
                  py: 1.5,
                  cursor: 'pointer',
                  bgcolor: item.read ? 'transparent' : 'action.hover',
                  borderBottom: 1,
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&:focus-visible': {
                    outline: 2,
                    outlineColor: 'primary.main',
                    outlineOffset: -2,
                  },
                }}
              >
                <Box sx={{ pt: 0.25 }}>{SEVERITY_ICON[item.severity]}</Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2">{item.title}</Typography>
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{ overflowWrap: 'anywhere' }}
                  >
                    {item.message}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {formatRelativeTime(item.createdAt)} &middot; {item.source}
                  </Typography>
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Popover>
    </>
  );
}
