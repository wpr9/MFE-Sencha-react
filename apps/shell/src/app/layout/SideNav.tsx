import {
  Box,
  ButtonBase,
  Chip,
  Drawer,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { HOST_CONTRACT_VERSION } from '@meridian/contracts';
import { useMemo, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { entryForPath, visibleEntries, type AppEntry } from '../catalog';
import { useShellHost } from '../platform-context';
import { prefetchRemote } from '../remotes';
import { useShellUi } from '../ui-store';
import { isPlainLeftClick } from './links';

const SECTIONS: ReadonlyArray<{ id: AppEntry['section']; label: string }> = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'platform', label: 'Platform' },
];

function NavItem({
  entry,
  active,
  rail,
  onNavigate,
}: {
  readonly entry: AppEntry;
  readonly active: boolean;
  readonly rail: boolean;
  readonly onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const { scheme } = useTheme().meridian;
  const Icon = entry.icon;
  const go = (event: MouseEvent) => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    navigate(entry.path);
    onNavigate();
  };
  const prefetch = () => entry.remote && prefetchRemote(entry.remote.name);

  if (rail) {
    return (
      // describeChild: the description supplements the visible label, it does not replace it.
      <Tooltip title={entry.description} placement="right" describeChild>
        <ButtonBase
          component="a"
          href={entry.path}
          onClick={go}
          onMouseEnter={prefetch}
          onFocus={prefetch}
          aria-current={active ? 'page' : undefined}
          sx={{
            flexDirection: 'column',
            gap: 0.5,
            width: 72,
            py: 0.75,
            borderRadius: 2,
            color: active ? 'text.primary' : 'text.secondary',
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 32,
              borderRadius: 4,
              display: 'grid',
              placeItems: 'center',
              bgcolor: active ? scheme.selected : 'transparent',
              color: active ? scheme.onSelected : 'inherit',
              transition: 'background-color 150ms',
              '.MuiButtonBase-root:hover > &': {
                bgcolor: active ? scheme.selected : scheme.hoverOverlay,
              },
            }}
          >
            <Icon fontSize="small" />
          </Box>
          <Typography
            variant="body2"
            sx={{
              fontFamily: 'var(--mrd-font-brand)',
              fontWeight: active ? 600 : 500,
              fontSize: 12,
            }}
          >
            {entry.label}
          </Typography>
        </ButtonBase>
      </Tooltip>
    );
  }

  return (
    <ButtonBase
      component="a"
      href={entry.path}
      onClick={go}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      aria-current={active ? 'page' : undefined}
      sx={{
        width: '100%',
        height: 40,
        px: 2,
        gap: 1.5,
        justifyContent: 'flex-start',
        borderRadius: 5,
        color: active ? scheme.onSelected : 'text.primary',
        bgcolor: active ? scheme.selected : 'transparent',
        '&:hover': { bgcolor: active ? scheme.selected : scheme.hoverOverlay },
        transition: 'background-color 150ms',
      }}
    >
      <Icon fontSize="small" sx={{ color: active ? 'inherit' : 'text.secondary' }} />
      <Typography
        sx={{
          flex: 1,
          textAlign: 'left',
          fontFamily: 'var(--mrd-font-brand)',
          fontSize: 14,
          fontWeight: active ? 600 : 500,
        }}
      >
        {entry.label}
      </Typography>
      {entry.remote?.technology === 'Ext JS' && (
        <Chip
          label="Ext JS"
          size="small"
          sx={{
            height: 20,
            fontSize: 11,
            bgcolor: active ? 'background.paper' : 'action.hover',
            color: 'text.secondary',
          }}
        />
      )}
    </ButtonBase>
  );
}

function NavContent({
  rail,
  onNavigate,
}: {
  readonly rail: boolean;
  readonly onNavigate: () => void;
}) {
  const host = useShellHost();
  const location = useLocation();
  const entries = useMemo(() => visibleEntries(host.auth), [host]);
  const active = entryForPath(location.pathname);
  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        px: rail ? 0 : 1.5,
        pt: 1,
        alignItems: rail ? 'center' : 'stretch',
      }}
    >
      {SECTIONS.map((section) => (
        <Box
          key={section.id}
          sx={{
            mb: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: rail ? 0.5 : 0.25,
            alignItems: rail ? 'center' : 'stretch',
          }}
        >
          {!rail && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                px: 2,
                pt: 1.5,
                pb: 0.75,
                fontFamily: 'var(--mrd-font-brand)',
                fontWeight: 500,
              }}
            >
              {section.label}
            </Typography>
          )}
          {rail && section.id === 'platform' && (
            <Box sx={{ width: 32, height: '1px', bgcolor: 'divider', my: 1 }} />
          )}
          {entries
            .filter((entry) => entry.section === section.id)
            .map((entry) => (
              <NavItem
                key={entry.id}
                entry={entry}
                rail={rail}
                active={active?.id === entry.id}
                onNavigate={onNavigate}
              />
            ))}
        </Box>
      ))}
      <Box sx={{ flex: 1 }} />
      {!rail && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2, fontSize: 11 }}>
          Shell {__SHELL_VERSION__} &middot; Host API {HOST_CONTRACT_VERSION}
        </Typography>
      )}
    </Box>
  );
}

/** Primary navigation: a rail or full drawer on desktop, a temporary drawer on mobile. */
export function SideNav() {
  const expanded = useShellUi((state) => state.navExpanded);
  const mobileOpen = useShellUi((state) => state.mobileNavOpen);
  const setMobileNavOpen = useShellUi((state) => state.setMobileNavOpen);
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'));

  if (mobile) {
    return (
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileNavOpen(false)}
        slotProps={{ paper: { sx: { width: 280, borderRadius: '0 16px 16px 0' } } }}
      >
        <NavContent rail={false} onNavigate={() => setMobileNavOpen(false)} />
      </Drawer>
    );
  }
  return (
    <Box
      sx={{
        gridArea: 'nav',
        width: expanded ? 256 : 80,
        transition: 'width 200ms cubic-bezier(0.2, 0, 0, 1)',
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      <NavContent rail={!expanded} onNavigate={() => undefined} />
    </Box>
  );
}
