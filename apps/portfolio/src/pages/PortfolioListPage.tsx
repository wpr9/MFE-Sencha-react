import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import { Box, Card, CardActionArea, Stack, Typography } from '@mui/material';
import { Permission, describeError, type PortfolioSummary } from '@meridian/contracts';
import { useFormatters, useHost, usePermission } from '@meridian/react-sdk';
import { EmptyState, ErrorState, PageHeader, StatTile, StatusChip, TrendText } from '@meridian/ui';
import { useNavigate } from 'react-router';
import { usePortfolioList } from '../api';
import { PortfolioTotals } from '../components/PortfolioTotals';
import { complianceChip, totals } from '../model';

function PortfolioCard({ portfolio }: { readonly portfolio: PortfolioSummary }) {
  const navigate = useNavigate();
  const host = useHost();
  const f = useFormatters();
  const chip = complianceChip(portfolio);
  const active = portfolio.ytdReturnPercent - portfolio.benchmarkYtdReturnPercent;
  return (
    <Card sx={{ height: '100%' }}>
      <CardActionArea
        onClick={() => {
          host.state.setActivePortfolio(portfolio.id);
          navigate(portfolio.id);
        }}
        sx={{
          height: '100%',
          p: 2.5,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 2,
        }}
      >
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" noWrap>
              {portfolio.name}
            </Typography>
            <Typography variant="body1" color="text.secondary" noWrap>
              {portfolio.id} &middot; {portfolio.strategy}
            </Typography>
          </Box>
          {chip && <StatusChip tone={chip.tone} label={chip.label} />}
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              NAV
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 500 }}>
              {f.currency(portfolio.nav, true)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Today
            </Typography>
            <TrendText value={portfolio.dayPnl} sx={{ typography: 'h5', fontWeight: 500 }}>
              {f.signedPercent(portfolio.dayPnlPercent)}
            </TrendText>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              YTD
            </Typography>
            <TrendText
              value={portfolio.ytdReturnPercent}
              sx={{ typography: 'h5', fontWeight: 500 }}
            >
              {f.signedPercent(portfolio.ytdReturnPercent, 1)}
            </TrendText>
          </Box>
        </Box>
        <Typography variant="body1" color="text.secondary">
          {active >= 0 ? 'Ahead of' : 'Behind'} {portfolio.benchmark} by{' '}
          <TrendText value={active} showIcon={false}>
            {f.percent(Math.abs(active), 1)}
          </TrendText>{' '}
          &middot; {portfolio.manager.name}
        </Typography>
      </CardActionArea>
    </Card>
  );
}

/** Entitled portfolios as cards, with NAV-weighted totals. */
export function PortfolioListPage() {
  const list = usePortfolioList();
  const portfolios = list.data ?? [];
  const canSeeCompliance = usePermission(Permission.ComplianceRead);

  return (
    <Box>
      <PageHeader
        title="Portfolios"
        subtitle="Funds you are entitled to. Select one to see holdings, performance and risk."
      />
      <Box sx={{ px: 3, pb: 3 }}>
        {list.isError ? (
          <ErrorState
            message="Portfolios could not be loaded."
            detail={describeError(list.error)}
            onRetry={() => void list.refetch()}
          />
        ) : (
          <>
            <Box
              sx={{
                display: 'grid',
                gap: 3,
                gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' },
                mb: 3,
              }}
            >
              <PortfolioTotals portfolios={portfolios} loading={list.isPending} />
              {canSeeCompliance ? (
                <StatTile
                  label="Open compliance alerts"
                  value={String(totals(portfolios).alerts)}
                  loading={list.isPending}
                />
              ) : (
                <StatTile
                  label="Portfolios"
                  value={String(portfolios.length)}
                  loading={list.isPending}
                />
              )}
            </Box>
            {!list.isPending && portfolios.length === 0 ? (
              <EmptyState
                icon={<AccountBalanceWalletOutlined />}
                title="No portfolios"
                description="You are not entitled to any portfolio yet."
              />
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: {
                    xs: '1fr',
                    md: '1fr 1fr',
                    xl: 'repeat(3, minmax(0, 1fr))',
                  },
                }}
              >
                {portfolios.map((portfolio) => (
                  <PortfolioCard key={portfolio.id} portfolio={portfolio} />
                ))}
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
