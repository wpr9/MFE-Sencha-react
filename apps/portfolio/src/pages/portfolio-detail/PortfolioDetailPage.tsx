import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import { Box, Button, Chip, Skeleton, Stack, Tab, Tabs } from '@mui/material';
import { FeatureFlag, Permission, describeError, isHttpError } from '@meridian/contracts';
import { useFlag, useHost, useIntent, usePermission } from '@meridian/react-sdk';
import { EmptyState, ErrorState, PageHeader, StatusChip } from '@meridian/ui';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { usePortfolio } from '../../api';
import { complianceChip } from '../../model';
import { HoldingsTab } from './HoldingsTab';
import { OverviewTab } from './OverviewTab';
import { RiskTab } from './RiskTab';
import { useLiveHoldings } from './useLiveHoldings';

const TABS = ['overview', 'holdings', 'risk'] as const;
type TabId = (typeof TABS)[number];
const isTabId = (value: string): value is TabId => (TABS as readonly string[]).includes(value);

/** One portfolio: header with context, then the overview / holdings / risk tab. */
export function PortfolioDetailPage() {
  const { portfolioId = '', tab = 'overview' } = useParams();
  const host = useHost();
  const navigate = useNavigate();
  const intent = useIntent();
  const canTrade = usePermission(Permission.OrderCreate);
  const canSeeOrders = usePermission(Permission.OrderRead);
  const riskEnabled = useFlag(FeatureFlag.PortfolioRiskAnalytics);
  const query = usePortfolio(portfolioId);
  const live = useLiveHoldings(query.data);
  const current: TabId = isTabId(tab) ? tab : 'overview';

  // Adopt the portfolio as workspace context only once it has loaded: an unknown or
  // forbidden id must never become the context every other remote follows.
  const loadedId = query.data?.id;
  useEffect(() => {
    if (loadedId && host.state.getSnapshot().activePortfolioId !== loadedId) {
      host.state.setActivePortfolio(loadedId);
    }
  }, [host, loadedId]);

  if (query.isError) {
    const status = isHttpError(query.error) ? query.error.status : undefined;
    return (
      <Box sx={{ p: 3 }}>
        {status === 403 || status === 404 ? (
          <EmptyState
            title={
              status === 403 ? 'You are not entitled to this portfolio' : 'Portfolio not found'
            }
            description={`Portfolio ${portfolioId} is not available to you.`}
            action={<Button onClick={() => navigate('..')}>Back to portfolios</Button>}
          />
        ) : (
          <ErrorState
            message="The portfolio could not be loaded."
            detail={describeError(query.error)}
            onRetry={() => void query.refetch()}
          />
        )}
      </Box>
    );
  }
  const portfolio = query.data;
  const chip = portfolio ? complianceChip(portfolio) : null;

  return (
    <Box>
      <PageHeader
        eyebrow={
          <Button
            size="small"
            startIcon={<ArrowBackOutlined />}
            onClick={() => {
              host.state.setActivePortfolio(null);
              navigate('..');
            }}
            sx={{ ml: -1.5 }}
          >
            Portfolios
          </Button>
        }
        title={portfolio?.name ?? portfolioId}
        subtitle={
          portfolio &&
          `${portfolio.strategy} · Benchmark ${portfolio.benchmark} · Managed by ${portfolio.manager.name}`
        }
        meta={
          portfolio && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Chip size="small" label={portfolio.id} sx={{ fontFamily: 'var(--mrd-font-mono)' }} />
              <Chip size="small" label={portfolio.baseCurrency} />
              <Chip size="small" label={`${portfolio.holdingsCount} holdings`} />
              {chip && <StatusChip tone={chip.tone} label={chip.label} />}
            </Stack>
          )
        }
        actions={
          <>
            {canSeeOrders && (
              <Button
                variant="outlined"
                startIcon={<ReceiptLongOutlined />}
                onClick={() => host.navigation.navigate('/orders')}
              >
                Orders
              </Button>
            )}
            {canTrade && (
              <Button
                variant="contained"
                // Only once the portfolio is known to exist and be entitled: the URL alone proves neither.
                disabled={!portfolio}
                onClick={() => intent('trade.ticket.open', { portfolioId })}
              >
                Trade
              </Button>
            )}
          </>
        }
      >
        <Tabs
          // No selected tab (not an invalid value) when a deep link names a tab the flag hides.
          value={current === 'risk' && !riskEnabled ? false : current}
          onChange={(_, value: TabId) =>
            navigate(value === 'overview' ? `../${portfolioId}` : `../${portfolioId}/${value}`)
          }
          sx={{ mt: 1, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="overview" label="Overview" />
          <Tab value="holdings" label="Holdings" />
          {riskEnabled && <Tab value="risk" label="Risk" />}
        </Tabs>
      </PageHeader>
      <Box sx={{ p: 3 }}>
        {!portfolio ? (
          <Stack spacing={2.5} role="status" aria-busy aria-label="Loading portfolio">
            <Stack direction="row" spacing={3}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rounded" height={96} sx={{ flex: 1 }} />
              ))}
            </Stack>
            <Skeleton variant="rounded" height={360} />
          </Stack>
        ) : current === 'holdings' ? (
          <HoldingsTab portfolio={portfolio} live={live} />
        ) : current === 'risk' ? (
          riskEnabled ? (
            <RiskTab portfolio={portfolio} />
          ) : (
            <EmptyState
              title="Risk analytics is not enabled for you"
              description="This beta feature is rolled out by feature flag."
            />
          )
        ) : (
          <OverviewTab portfolio={portfolio} live={live} />
        )}
      </Box>
    </Box>
  );
}
