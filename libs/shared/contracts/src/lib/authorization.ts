/**
 * Authorization vocabulary shared by the BFF (authoritative enforcement) and
 * the frontends (UX gating only - never a security boundary).
 *
 * Frontends check *permissions*, never roles: the role -> permission mapping
 * is owned by the server and may change without a frontend release.
 */
export const Permission = {
  PortfolioRead: 'portfolio:read',
  OrderRead: 'order:read',
  OrderCreate: 'order:create',
  OrderApprove: 'order:approve',
  OrderRoute: 'order:route',
  OrderCancel: 'order:cancel',
  ComplianceRead: 'compliance:read',
  ComplianceManage: 'compliance:manage',
  MarketDataRead: 'marketdata:read',
  PlatformAdmin: 'platform:admin',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

export const Role = {
  PortfolioManager: 'portfolio-manager',
  Trader: 'trader',
  ComplianceOfficer: 'compliance-officer',
  Analyst: 'analyst',
  PlatformAdmin: 'platform-admin',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** Feature flags are evaluated server-side per user and delivered with the session. */
export const FeatureFlag = {
  CommandPalette: 'shell.command-palette',
  HomeMarketMovers: 'home.market-movers',
  PortfolioRiskAnalytics: 'portfolio.risk-analytics',
  BlotterCellFlash: 'blotter.cell-flash',
  TradingAlgoOrders: 'trading.algo-orders',
} as const;

export type FeatureFlag = (typeof FeatureFlag)[keyof typeof FeatureFlag];

/** Portfolio data entitlements: an explicit allow-list, or every portfolio. */
export type PortfolioEntitlement =
  | { readonly all: true }
  | { readonly all: false; readonly ids: readonly string[] };

export function isPortfolioEntitled(
  entitlement: PortfolioEntitlement,
  portfolioId: string,
): boolean {
  return entitlement.all || entitlement.ids.includes(portfolioId);
}
