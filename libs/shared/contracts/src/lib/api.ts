/**
 * Paths of the BFF REST API, relative to `HostEnvironment.apiBaseUrl`.
 * Clients build URLs through these helpers so a route change is a compile
 * error rather than a runtime 404.
 */
const id = (value: string) => encodeURIComponent(value);

export const apiPaths = {
  portfolios: () => '/portfolios',
  portfolio: (portfolioId: string) => `/portfolios/${id(portfolioId)}`,
  performance: (portfolioId: string) => `/portfolios/${id(portfolioId)}/performance`,
  securities: () => '/securities',
  quotes: () => '/quotes',
  intraday: (symbol: string) => `/quotes/${id(symbol)}/intraday`,
  orders: () => '/orders',
  order: (orderId: string) => `/orders/${id(orderId)}`,
  orderAction: (orderId: string, action: 'approve' | 'reject' | 'route' | 'cancel') =>
    `/orders/${id(orderId)}/${action}`,
  complianceCheck: () => '/compliance/check',
  complianceRules: () => '/compliance/rules',
  complianceUtilization: () => '/compliance/utilization',
  complianceAlerts: () => '/compliance/alerts',
  complianceAlertResolution: (alertId: string) => `/compliance/alerts/${id(alertId)}/resolution`,
  stream: () => '/stream',
  telemetry: () => '/telemetry',
} as const;

/** Paths of the authentication endpoints (served by the BFF at the origin root). */
export const authPaths = {
  login: '/auth/login',
  logout: '/auth/logout',
  session: '/auth/session',
  keepAlive: '/auth/session/keep-alive',
  /** Mock IdP only: lets the idle timeout lapse shortly, to demonstrate the expiry UX. */
  simulateExpiry: '/auth/session/simulate-expiry',
} as const;
