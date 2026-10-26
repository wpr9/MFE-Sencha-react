import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { Permission } from '@meridian/contracts';
import { defineReactRemote, useFormatters, useIntent, usePermission } from '@meridian/react-sdk';
import { ErrorState, ListSkeleton, StatusChip, TrendText } from '@meridian/ui';
import { useLivePortfolioInvalidation, usePortfolioList } from '../api';
import { PortfolioTotals } from '../components/PortfolioTotals';
import { complianceChip } from '../model';

/** Portfolio totals and a compact entitled-portfolio list for the overview dashboard. */
function SummaryWidget() {
  useLivePortfolioInvalidation();
  const list = usePortfolioList();
  const f = useFormatters();
  const intent = useIntent();
  // Field-level need-to-know: the BFF withholds compliance posture without this permission.
  const canSeeCompliance = usePermission(Permission.ComplianceRead);
  const columns = `minmax(0, 2fr) repeat(3, minmax(0, 1fr))${canSeeCompliance ? ' 120px' : ''}`;
  if (list.isError)
    return (
      <ErrorState compact message="Portfolios unavailable." onRetry={() => void list.refetch()} />
    );
  const portfolios = list.data ?? [];
  return (
    <Box
      sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' }, height: '100%' }}
    >
      <Stack
        spacing={3}
        sx={{
          p: 2.5,
          borderRight: { md: 1 },
          borderColor: 'divider',
        }}
      >
        <PortfolioTotals portfolios={portfolios} loading={list.isPending} />
      </Stack>
      <Box sx={{ overflowY: 'auto' }}>
        {/* Visual column labels; each row's accessible name carries them for screen readers. */}
        <Box
          aria-hidden
          sx={{
            display: 'grid',
            gridTemplateColumns: columns,
            gap: 2,
            px: 2.5,
            py: 1.25,
            borderBottom: 1,
            borderColor: 'divider',
            color: 'text.secondary',
            typography: 'body2',
            fontWeight: 500,
          }}
        >
          <span>Portfolio</span>
          <Box sx={{ textAlign: 'right' }}>NAV</Box>
          <Box sx={{ textAlign: 'right' }}>Today</Box>
          <Box sx={{ textAlign: 'right' }}>YTD</Box>
          {canSeeCompliance && <span>Compliance</span>}
        </Box>
        {list.isPending && <ListSkeleton rows={3} />}
        <Box role="list" aria-label="Portfolios">
          {portfolios.map((portfolio) => {
            const chip = complianceChip(portfolio);
            const label = [
              `${portfolio.name} (${portfolio.id})`,
              `NAV ${f.currency(portfolio.nav, true)}`,
              `today ${f.signedPercent(portfolio.dayPnlPercent)}`,
              `YTD ${f.signedPercent(portfolio.ytdReturnPercent, 1)}`,
              chip?.label,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <Box role="listitem" key={portfolio.id}>
                <ButtonBase
                  aria-label={label}
                  onClick={() => intent('portfolio.open', { portfolioId: portfolio.id })}
                  sx={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: columns,
                    gap: 2,
                    alignItems: 'center',
                    textAlign: 'left',
                    px: 2.5,
                    py: 1.5,
                    borderBottom: 1,
                    borderColor: 'divider',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>
                      {portfolio.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {portfolio.id} &middot; {portfolio.manager.name}
                    </Typography>
                  </Box>
                  <Typography
                    variant="body1"
                    sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {f.currency(portfolio.nav, true)}
                  </Typography>
                  <Box sx={{ textAlign: 'right' }}>
                    <TrendText value={portfolio.dayPnl}>
                      {f.signedPercent(portfolio.dayPnlPercent)}
                    </TrendText>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <TrendText value={portfolio.ytdReturnPercent}>
                      {f.signedPercent(portfolio.ytdReturnPercent, 1)}
                    </TrendText>
                  </Box>
                  {chip && (
                    <Box>
                      <StatusChip tone={chip.tone} label={chip.label} />
                    </Box>
                  )}
                </ButtonBase>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

/** Federated as `portfolio/SummaryWidget` (overview dashboard). */
export default defineReactRemote({ component: SummaryWidget });
