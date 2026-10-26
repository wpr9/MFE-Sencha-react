import CheckOutlined from '@mui/icons-material/CheckOutlined';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import {
  Box,
  ButtonBase,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { Permission, type ComplianceStatus } from '@meridian/contracts';
import { formatCurrency, formatSignedPercent } from '@meridian/formatting';
import { StatusChip, TrendText } from '@meridian/ui';
import { useState, type ReactNode } from 'react';
import { useHostStore, useShellHost } from '../platform-context';
import { useShellUi } from '../ui-store';
import { usePortfolios } from './portfolio-data';

const COMPLIANCE_CHIP: Record<
  ComplianceStatus,
  { tone: 'success' | 'warning' | 'error'; label: string }
> = {
  ok: { tone: 'success', label: 'Compliant' },
  warning: { tone: 'warning', label: 'Near limit' },
  breach: { tone: 'error', label: 'Breach' },
};

/**
 * The row is clickable for pointer users; keyboard and screen-reader users get
 * a real button per portfolio (Enter/Space, a name, and which one is current).
 */
function PickButton({
  current,
  onPick,
  children,
}: {
  readonly current: boolean;
  readonly onPick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <ButtonBase
      onClick={(event) => {
        event.stopPropagation();
        onPick();
      }}
      aria-current={current ? 'true' : undefined}
      sx={{
        display: 'block',
        textAlign: 'left',
        borderRadius: 1,
        '&.Mui-focusVisible': {
          outline: '2px solid var(--mrd-color-focus-ring)',
          outlineOffset: 2,
        },
      }}
    >
      {children}
    </ButtonBase>
  );
}

/**
 * Workspace-wide portfolio context (cf. the Google Cloud project picker).
 * The selection lives in host state, so every remote - including the Ext JS
 * blotter - follows it.
 */
export function PortfolioPicker() {
  const open = useShellUi((state) => state.portfolioPickerOpen);
  const setOpen = useShellUi((state) => state.setPortfolioPickerOpen);
  const activeId = useHostStore((state) => state.activePortfolioId);
  const setActivePortfolio = useHostStore((state) => state.setActivePortfolio);
  const portfolios = usePortfolios(open);
  // The BFF withholds compliance posture without compliance:read (field-level need-to-know).
  const canSeeCompliance = useShellHost().auth.hasPermission(Permission.ComplianceRead);
  // Check mark + name + id + manager + NAV + YTD, plus compliance when it is visible.
  const columnCount = canSeeCompliance ? 7 : 6;
  const { scheme } = useTheme().meridian;
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const rows = (portfolios.data ?? []).filter(
    (p) =>
      !q ||
      [p.name, p.id, p.strategy, p.manager.name].some((field) => field.toLowerCase().includes(q)),
  );
  const select = (id: string | null) => {
    setActivePortfolio(id);
    setOpen(false);
  };
  const rowSx = (selected: boolean) => ({
    cursor: 'pointer',
    '& td': { borderColor: 'divider' },
    bgcolor: selected ? scheme.selected : 'transparent',
    '&:hover': { bgcolor: selected ? scheme.selected : scheme.surfaceContainer },
  });

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      // Can open over a remote's dialog, whose MUI focus trap the shell cannot see (ADR-0002).
      disableEnforceFocus
      fullWidth
      maxWidth="md"
      aria-labelledby="portfolio-picker-title"
    >
      <DialogTitle id="portfolio-picker-title">Select a portfolio</DialogTitle>
      <DialogContent sx={{ pb: 0 }}>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Sets the context for every module in the workspace. You only see portfolios you are
          entitled to.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Search by name, ID, strategy or manager"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ mb: 2 }}
        />
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
          <Table size="small" aria-label="Portfolios">
            <TableHead>
              <TableRow>
                <TableCell width={36} />
                <TableCell>Name</TableCell>
                <TableCell>ID</TableCell>
                <TableCell>Manager</TableCell>
                <TableCell align="right">NAV</TableCell>
                <TableCell align="right">YTD</TableCell>
                {canSeeCompliance && <TableCell>Compliance</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow hover={false} sx={rowSx(activeId === null)} onClick={() => select(null)}>
                <TableCell>
                  {activeId === null && <CheckOutlined fontSize="small" color="primary" />}
                </TableCell>
                <TableCell colSpan={columnCount - 1}>
                  <PickButton current={activeId === null} onPick={() => select(null)}>
                    <Typography variant="subtitle2" component="span">
                      All portfolios
                    </Typography>
                  </PickButton>
                </TableCell>
              </TableRow>
              {portfolios.loading &&
                [0, 1, 2].map((i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={columnCount}>
                      <Skeleton />
                    </TableCell>
                  </TableRow>
                ))}
              {rows.map((portfolio) => (
                <TableRow
                  key={portfolio.id}
                  sx={rowSx(activeId === portfolio.id)}
                  onClick={() => select(portfolio.id)}
                >
                  <TableCell>
                    {activeId === portfolio.id && (
                      <CheckOutlined fontSize="small" color="primary" />
                    )}
                  </TableCell>
                  <TableCell>
                    <PickButton
                      current={activeId === portfolio.id}
                      onPick={() => select(portfolio.id)}
                    >
                      <Typography variant="subtitle2" component="span" sx={{ display: 'block' }}>
                        {portfolio.name}
                      </Typography>
                      <Typography
                        variant="body2"
                        component="span"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        {portfolio.strategy}
                      </Typography>
                    </PickButton>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'var(--mrd-font-mono)', fontSize: 13 }}>
                    {portfolio.id}
                  </TableCell>
                  <TableCell>{portfolio.manager.name}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(portfolio.nav, { compact: true })}
                  </TableCell>
                  <TableCell align="right">
                    <TrendText value={portfolio.ytdReturnPercent}>
                      {formatSignedPercent(portfolio.ytdReturnPercent)}
                    </TrendText>
                  </TableCell>
                  {canSeeCompliance && (
                    <TableCell>
                      {portfolio.complianceStatus !== null && (
                        <StatusChip {...COMPLIANCE_CHIP[portfolio.complianceStatus]} />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(false)}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
