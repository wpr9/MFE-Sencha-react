import { Box, useMediaQuery, useTheme } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { entryForPath } from '../catalog';
import { CommandPalette } from './CommandPalette';
import { PortfolioPicker } from './PortfolioPicker';
import { SessionDialogs, Toaster, TradeTicketDrawer } from './overlays';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';

/**
 * Application frame: top bar, navigation and a rounded content panel on a
 * tonal background (Google Material 3 / Cloud console layout), plus the
 * workspace-level overlays every remote can trigger through intents.
 */
export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'));
  const entry = entryForPath(location.pathname);
  const [announcement, setAnnouncement] = useState('');
  const previousApp = useRef(entry?.id);

  // Route-change accessibility: title, focus and a polite announcement when
  // moving between apps (in-app navigation is left to the remote).
  useEffect(() => {
    document.title = entry && entry.id !== 'home' ? `${entry.label} – Meridian` : 'Meridian';
    if (previousApp.current !== entry?.id) {
      previousApp.current = entry?.id;
      mainRef.current?.focus({ preventScroll: true });
      setAnnouncement(entry ? `${entry.label} page` : 'Page not found');
    }
  }, [entry]);

  return (
    <Box
      sx={{
        height: '100dvh',
        display: 'grid',
        gridTemplateRows: '64px minmax(0, 1fr)',
        gridTemplateColumns: mobile ? 'minmax(0, 1fr)' : 'auto minmax(0, 1fr)',
        gridTemplateAreas: mobile ? '"top" "main"' : '"top top" "nav main"',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      <Box
        component="a"
        href="#main"
        sx={{
          position: 'absolute',
          left: 16,
          top: -48,
          zIndex: 2000,
          px: 2,
          py: 1,
          borderRadius: 2,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          typography: 'subtitle2',
          '&:focus': { top: 12 },
        }}
      >
        Skip to main content
      </Box>
      <TopBar />
      <SideNav />
      <Box
        component="main"
        id="main"
        ref={mainRef}
        tabIndex={-1}
        sx={{
          gridArea: 'main',
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
          borderRadius: mobile ? '16px 16px 0 0' : 4,
          mr: mobile ? 0 : 1,
          mb: mobile ? 0 : 1,
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        <Outlet />
      </Box>
      <Box
        role="status"
        aria-live="polite"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        {announcement}
      </Box>
      <CommandPalette />
      <PortfolioPicker />
      <TradeTicketDrawer />
      <SessionDialogs />
      <Toaster />
    </Box>
  );
}
