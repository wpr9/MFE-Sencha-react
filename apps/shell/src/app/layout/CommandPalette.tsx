import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import AddOutlined from '@mui/icons-material/AddOutlined';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import KeyboardReturnOutlined from '@mui/icons-material/KeyboardReturnOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import SearchOffOutlined from '@mui/icons-material/SearchOffOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import ShowChartOutlined from '@mui/icons-material/ShowChartOutlined';
import { Box, Dialog, InputBase, Typography, useTheme } from '@mui/material';
import { Permission, SecuritySchema, apiPaths, type Security } from '@meridian/contracts';
import { EmptyState, visuallyHidden } from '@meridian/ui';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { visibleEntries } from '../catalog';
import { useHostStore, usePlatform, useShellHost, useShellIntents } from '../platform-context';
import { useShellUi } from '../ui-store';
import { usePortfolios } from './portfolio-data';

/** Results per group keep the list scannable; the search box narrows further. */
const MAX_SECURITY_RESULTS = 6;
const MAX_PORTFOLIO_RESULTS = 5;
/** Typing pause before securities are searched server-side. */
const SEARCH_DEBOUNCE_MS = 150;

interface PaletteItem {
  readonly id: string;
  readonly group: 'Pages' | 'Portfolios' | 'Securities' | 'Actions';
  readonly label: string;
  readonly detail?: string;
  readonly icon: ReactNode;
  readonly run: () => void;
}

function useSecuritySearch(query: string) {
  const host = useShellHost();
  const [results, setResults] = useState<{ query: string; items: Security[] }>({
    query: '',
    items: [],
  });
  const enabled = Boolean(query) && host.auth.hasPermission(Permission.MarketDataRead);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      host.http
        .get(apiPaths.securities(), {
          query: { q: query },
          signal: controller.signal,
          parser: SecuritySchema.array(),
        })
        .then((data) => setResults({ query, items: data.slice(0, MAX_SECURITY_RESULTS) }))
        // Superseded or aborted searches are simply dropped; the next keystroke retries.
        .catch(() => undefined);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [host, query, enabled]);
  return enabled && results.query === query ? results.items : [];
}

/** Keyboard-first search over pages, portfolios, securities and actions (`/` or Ctrl/Cmd+K). */
export function CommandPalette() {
  const open = useShellUi((state) => state.paletteOpen);
  const setOpen = useShellUi((state) => state.setPaletteOpen);
  const platform = usePlatform();
  const host = useShellHost();
  const { dispatch } = useShellIntents();
  const navigate = useNavigate();
  const { scheme } = useTheme().meridian;
  const theme = useHostStore((state) => state.theme);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const portfolios = usePortfolios(open && host.auth.hasPermission(Permission.PortfolioRead));
  const securities = useSecuritySearch(open ? query.trim() : '');

  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(0);
  };
  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (...fields: Array<string | undefined>) =>
      !q || fields.some((field) => field?.toLowerCase().includes(q));
    const pages: PaletteItem[] = visibleEntries(host.auth)
      .filter((entry) => match(entry.label, entry.description))
      .map((entry) => ({
        id: `page:${entry.id}`,
        group: 'Pages',
        label: entry.label,
        detail: entry.description,
        icon: <entry.icon fontSize="small" />,
        run: () => navigate(entry.path),
      }));
    const funds: PaletteItem[] = (portfolios.data ?? [])
      .filter((portfolio) => match(portfolio.name, portfolio.id, portfolio.strategy))
      .slice(0, MAX_PORTFOLIO_RESULTS)
      .map((portfolio) => ({
        id: `portfolio:${portfolio.id}`,
        group: 'Portfolios',
        label: portfolio.name,
        detail: `${portfolio.id} · ${portfolio.strategy}`,
        icon: <AccountBalanceWalletOutlined fontSize="small" />,
        run: () => dispatch('portfolio.open', { portfolioId: portfolio.id }),
      }));
    const canTrade = host.auth.hasPermission(Permission.OrderCreate);
    const stocks: PaletteItem[] = securities.map((security) => ({
      id: `security:${security.symbol}`,
      group: 'Securities',
      label: `${security.symbol} · ${security.name}`,
      detail: canTrade ? 'Open order ticket' : 'View in market watch',
      icon: <ShowChartOutlined fontSize="small" />,
      run: () =>
        canTrade
          ? dispatch('trade.ticket.open', { symbol: security.symbol })
          : dispatch('security.open', { symbol: security.symbol }),
    }));
    const actions: PaletteItem[] = [
      ...(canTrade
        ? [
            {
              id: 'action:order',
              group: 'Actions' as const,
              label: 'New order',
              detail: 'Open the order ticket',
              icon: <AddOutlined fontSize="small" />,
              run: () => dispatch('trade.ticket.open', {}),
            },
          ]
        : []),
      {
        id: 'action:theme',
        group: 'Actions',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: <DarkModeOutlined fontSize="small" />,
        run: () =>
          platform.store.getState().setThemePreference(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'action:signout',
        group: 'Actions',
        label: 'Sign out',
        icon: <LogoutOutlined fontSize="small" />,
        run: () => void host.auth.signOut(),
      },
    ];
    return [
      ...pages,
      ...funds,
      ...stocks,
      ...actions.filter((action) => match(action.label, action.detail)),
    ];
  }, [query, portfolios.data, securities, host, theme, dispatch, navigate, platform]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    close();
    item.run();
  };

  let lastGroup = '';
  return (
    <Dialog
      open={open}
      onClose={close}
      // Can open over a remote's dialog, whose MUI focus trap the shell cannot see (ADR-0002).
      disableEnforceFocus
      fullWidth
      maxWidth="sm"
      aria-labelledby="command-palette-title"
      slotProps={{
        paper: { sx: { alignSelf: 'flex-start', mt: '10vh', borderRadius: 4, overflow: 'hidden' } },
      }}
    >
      <Typography id="command-palette-title" component="h2" sx={visuallyHidden}>
        Command palette
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2.5,
          height: 60,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <SearchOutlined color="action" />
        <InputBase
          autoFocus
          fullWidth
          placeholder="Search pages, portfolios, securities and actions"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          inputProps={{
            'aria-label': 'Search',
            'aria-controls': 'palette-results',
            'aria-activedescendant': items[active] ? `palette-${active}` : undefined,
            role: 'combobox',
            'aria-expanded': true,
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((value) => Math.min(items.length - 1, value + 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((value) => Math.max(0, value - 1));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              choose(items[active]);
            }
          }}
          sx={{ typography: 'subtitle1' }}
        />
      </Box>
      <Box
        ref={listRef}
        id="palette-results"
        role="listbox"
        sx={{ maxHeight: 440, overflowY: 'auto', py: 1 }}
      >
        {items.length === 0 && (
          <EmptyState
            compact
            icon={<SearchOffOutlined />}
            title="No results"
            description={`Nothing matches "${query}".`}
          />
        )}
        {items.map((item, index) => {
          const header = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          const selected = index === active;
          return (
            <Box key={item.id}>
              {header && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ px: 2.5, pt: 1.5, pb: 0.5, fontWeight: 500 }}
                >
                  {header}
                </Typography>
              )}
              <Box
                id={`palette-${index}`}
                data-index={index}
                role="option"
                aria-selected={selected}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(item)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  mx: 1,
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  cursor: 'pointer',
                  bgcolor: selected ? scheme.selected : 'transparent',
                  color: selected ? scheme.onSelected : 'text.primary',
                }}
              >
                <Box sx={{ display: 'flex', color: selected ? 'inherit' : 'text.secondary' }}>
                  {item.icon}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap>
                    {item.label}
                  </Typography>
                  {item.detail && (
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        color: selected ? 'inherit' : 'text.secondary',
                        opacity: selected ? 0.8 : 1,
                      }}
                    >
                      {item.detail}
                    </Typography>
                  )}
                </Box>
                {selected && <KeyboardReturnOutlined fontSize="small" sx={{ opacity: 0.7 }} />}
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          px: 2.5,
          py: 1.25,
          borderTop: 1,
          borderColor: 'divider',
          color: 'text.secondary',
        }}
      >
        <Typography variant="body2">↑↓ to navigate</Typography>
        <Typography variant="body2">↵ to open</Typography>
        <Typography variant="body2">esc to close</Typography>
      </Box>
    </Dialog>
  );
}
