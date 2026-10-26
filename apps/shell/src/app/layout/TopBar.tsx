import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import ArrowDropDownOutlined from '@mui/icons-material/ArrowDropDownOutlined';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import MenuOutlined from '@mui/icons-material/MenuOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  Chip,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Permission } from '@meridian/contracts';
import { LiveIndicator } from '@meridian/ui';
import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { useHostStore, usePlatform, useShellHost } from '../platform-context';
import { useShellUi } from '../ui-store';
import { AccountMenu, NotificationsButton } from './menus';
import { usePortfolios } from './portfolio-data';
import { isPlainLeftClick } from './links';

/** The Meridian mark (decorative; the brand link carries the accessible name). */
export function BrandMark({ size = 32 }: { readonly size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 48 48"
      aria-hidden
      sx={{ width: size, height: size, flex: 'none', display: 'block' }}
    >
      <defs>
        <linearGradient id="mrd-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4285f4" />
          <stop offset="1" stopColor="#0b57d0" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#mrd-mark)" />
      <path
        d="M12 34V15l12 11 12-11v19"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="26" r="2.6" fill="#fff" />
    </Box>
  );
}

function useConnection() {
  const { marketData } = usePlatform();
  return useSyncExternalStore(marketData.api.subscribeStatus, marketData.api.getStatus);
}

function PortfolioContextButton() {
  const host = useShellHost();
  const activeId = useHostStore((state) => state.activePortfolioId);
  const portfolios = usePortfolios();
  const open = useShellUi((state) => state.setPortfolioPickerOpen);
  const compact = useMediaQuery(useTheme().breakpoints.down('lg'));
  if (!host.auth.hasPermission(Permission.PortfolioRead)) return null;
  const active = portfolios.data?.find((portfolio) => portfolio.id === activeId);
  return (
    // describeChild: screen readers announce the selected portfolio, then this hint.
    <Tooltip title="Select the portfolio context for the whole workspace" describeChild>
      <Button
        variant="outlined"
        onClick={() => open(true)}
        startIcon={<AccountBalanceWalletOutlined />}
        endIcon={<ArrowDropDownOutlined />}
        sx={{
          color: 'text.primary',
          borderColor: 'divider',
          maxWidth: compact ? 200 : 280,
          flexShrink: 1,
          minWidth: 0,
          '& .MuiButton-startIcon': { color: 'primary.main' },
        }}
      >
        <Box
          component="span"
          sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {active ? active.name : 'All portfolios'}
        </Box>
      </Button>
    </Tooltip>
  );
}

function SearchTrigger() {
  const setPaletteOpen = useShellUi((state) => state.setPaletteOpen);
  const { scheme } = useTheme().meridian;
  return (
    <ButtonBase
      onClick={() => setPaletteOpen(true)}
      aria-label="Search (press / )"
      sx={{
        flex: 1,
        maxWidth: 720,
        minWidth: 0,
        height: 48,
        mx: 2,
        px: 2,
        gap: 1.5,
        justifyContent: 'flex-start',
        borderRadius: 6,
        bgcolor: scheme.surfaceContainerHigh,
        color: 'text.secondary',
        transition: 'background-color 150ms',
        '&:hover': {
          bgcolor: scheme.surfaceContainer,
          boxShadow: scheme.focusRing ? `inset 0 0 0 1px ${scheme.outlineVariant}` : 'none',
        },
      }}
    >
      <SearchOutlined />
      <Typography
        variant="subtitle1"
        noWrap
        sx={{ flex: 1, textAlign: 'left', color: 'text.secondary' }}
      >
        Search portfolios, securities and pages
      </Typography>
      <Box
        component="kbd"
        sx={{
          font: 'inherit',
          fontSize: 12,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          color: 'text.secondary',
          display: { xs: 'none', md: 'block' },
        }}
      >
        /
      </Box>
    </ButtonBase>
  );
}

/** Header: navigation toggle, brand, portfolio context, search, connection, theme, account. */
export function TopBar() {
  const platform = usePlatform();
  const host = useShellHost();
  const toggleNav = useShellUi((state) => state.toggleNav);
  const setMobileNavOpen = useShellUi((state) => state.setMobileNavOpen);
  const theme = useHostStore((state) => state.theme);
  const setThemePreference = useHostStore((state) => state.setThemePreference);
  const connection = useConnection();
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'));
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null);
  const user = host.auth.getUser();
  const demo = host.auth.getSession().authMode === 'mock';

  // Global shortcuts: "/" and Ctrl/Cmd+K open the command palette.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (
        (event.key === 'k' && (event.metaKey || event.ctrlKey)) ||
        (event.key === '/' && !typing)
      ) {
        event.preventDefault();
        useShellUi.getState().setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Box
      component="header"
      sx={{
        gridArea: 'top',
        display: 'flex',
        alignItems: 'center',
        height: 64,
        pl: 1,
        pr: 2,
        gap: 0.5,
        minWidth: 0,
      }}
    >
      <Tooltip title="Main menu">
        <IconButton
          aria-label="Main menu"
          onClick={() => (mobile ? setMobileNavOpen(true) : toggleNav())}
          sx={{ mx: 0.5 }}
        >
          <MenuOutlined />
        </IconButton>
      </Tooltip>
      <Box
        component="a"
        href="/"
        aria-label="Meridian home"
        onClick={(event: MouseEvent) => {
          if (!isPlainLeftClick(event)) return;
          event.preventDefault();
          platform.navigation.navigate('/');
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          color: 'text.primary',
          textDecoration: 'none',
          pr: 1.5,
          flexShrink: 0,
        }}
      >
        <BrandMark />
        <Typography
          sx={{
            fontFamily: 'var(--mrd-font-brand)',
            fontSize: 22,
            lineHeight: '28px',
            display: { xs: 'none', sm: 'block' },
          }}
        >
          Meridian
        </Typography>
        {demo && (
          <Chip
            label="Demo"
            size="small"
            sx={{
              height: 20,
              fontSize: 11,
              display: { xs: 'none', lg: 'flex' },
              bgcolor: 'action.hover',
            }}
          />
        )}
      </Box>
      {!mobile && <PortfolioContextButton />}
      <SearchTrigger />
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', px: 1.5 }}>
        <Tooltip title="Real-time connection (quotes, orders, alerts)">
          <span>
            <LiveIndicator status={connection} />
          </span>
        </Tooltip>
      </Box>
      <NotificationsButton />
      <Tooltip title={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}>
        <IconButton
          aria-label="Toggle theme"
          onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <LightModeOutlined /> : <DarkModeOutlined />}
        </IconButton>
      </Tooltip>
      <Tooltip title={`${user.name} · ${user.title}`}>
        <IconButton
          aria-label="Account"
          onClick={(event) => setAccountAnchor(event.currentTarget)}
          sx={{ p: 0.5, ml: 0.5 }}
        >
          <Avatar
            sx={{ width: 32, height: 32, bgcolor: user.avatarColor, color: '#fff', fontSize: 14 }}
          >
            {user.initials}
          </Avatar>
        </IconButton>
      </Tooltip>
      <AccountMenu anchor={accountAnchor} onClose={() => setAccountAnchor(null)} />
    </Box>
  );
}
