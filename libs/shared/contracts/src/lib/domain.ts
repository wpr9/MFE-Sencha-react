import { z } from 'zod';

/**
 * Domain DTOs exchanged between the BFF and the frontends.
 *
 * Schemas are the single source of truth: the BFF validates requests with
 * them and the frontends can validate responses at the boundary to detect
 * contract drift early. Monetary amounts are numbers in the portfolio's base
 * currency rounded to cents; a production system would transport decimals as
 * strings to avoid binary floating point.
 */

const isoDateTime = z.iso.datetime({ offset: true });

export const AssetClassSchema = z.enum(['Equity', 'ETF', 'Fixed Income', 'Cash']);
export type AssetClass = z.infer<typeof AssetClassSchema>;

export const SecuritySchema = z.object({
  symbol: z.string().min(1).max(12),
  name: z.string(),
  assetClass: AssetClassSchema,
  sector: z.string(),
  country: z.string().length(2),
  currency: z.string().length(3),
  exchange: z.string(),
});
export type Security = z.infer<typeof SecuritySchema>;

export const QuoteSchema = z.object({
  symbol: z.string(),
  last: z.number(),
  bid: z.number(),
  ask: z.number(),
  open: z.number(),
  previousClose: z.number(),
  change: z.number(),
  changePercent: z.number(),
  dayHigh: z.number(),
  dayLow: z.number(),
  volume: z.number().int().nonnegative(),
  timestamp: isoDateTime,
});
export type Quote = z.infer<typeof QuoteSchema>;

export const IntradaySeriesSchema = z.object({
  symbol: z.string(),
  points: z.array(z.object({ t: isoDateTime, price: z.number() })),
});
export type IntradaySeries = z.infer<typeof IntradaySeriesSchema>;

export const ComplianceStatusSchema = z.enum(['ok', 'warning', 'breach']);
export type ComplianceStatus = z.infer<typeof ComplianceStatusSchema>;

export const PersonRefSchema = z.object({ id: z.string(), name: z.string() });
export type PersonRef = z.infer<typeof PersonRefSchema>;

export const PortfolioSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  strategy: z.string(),
  baseCurrency: z.string().length(3),
  benchmark: z.string(),
  manager: PersonRefSchema,
  inceptionDate: z.iso.date(),
  nav: z.number(),
  cash: z.number(),
  dayPnl: z.number(),
  dayPnlPercent: z.number(),
  ytdReturnPercent: z.number(),
  benchmarkYtdReturnPercent: z.number(),
  holdingsCount: z.number().int().nonnegative(),
  /** `null` when the caller lacks `compliance:read` (field-level need-to-know). */
  complianceStatus: ComplianceStatusSchema.nullable(),
  /** `null` when the caller lacks `compliance:read`. */
  openAlerts: z.number().int().nonnegative().nullable(),
});
export type PortfolioSummary = z.infer<typeof PortfolioSummarySchema>;

export const HoldingSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  assetClass: AssetClassSchema,
  sector: z.string(),
  country: z.string(),
  quantity: z.number(),
  averageCost: z.number(),
  price: z.number(),
  marketValue: z.number(),
  weightPercent: z.number(),
  targetWeightPercent: z.number(),
  dayChange: z.number(),
  dayChangePercent: z.number(),
  unrealizedPnl: z.number(),
  unrealizedPnlPercent: z.number(),
});
export type Holding = z.infer<typeof HoldingSchema>;

export const ExposureSchema = z.object({ key: z.string(), weightPercent: z.number() });
export type Exposure = z.infer<typeof ExposureSchema>;

export const RiskMetricsSchema = z.object({
  beta: z.number(),
  annualizedVolatilityPercent: z.number(),
  valueAtRisk95: z.number(),
  trackingErrorPercent: z.number(),
  sharpeRatio: z.number(),
  maxDrawdownPercent: z.number(),
});
export type RiskMetrics = z.infer<typeof RiskMetricsSchema>;

export const PortfolioDetailSchema = PortfolioSummarySchema.extend({
  holdings: z.array(HoldingSchema),
  exposures: z.object({
    sector: z.array(ExposureSchema),
    assetClass: z.array(ExposureSchema),
    country: z.array(ExposureSchema),
  }),
  risk: RiskMetricsSchema,
});
export type PortfolioDetail = z.infer<typeof PortfolioDetailSchema>;

export const PerformanceRangeSchema = z.enum(['1M', '3M', '6M', 'YTD', '1Y']);
export type PerformanceRange = z.infer<typeof PerformanceRangeSchema>;

export const PerformanceSeriesSchema = z.object({
  portfolioId: z.string(),
  range: PerformanceRangeSchema,
  benchmark: z.string(),
  points: z.array(
    z.object({
      date: z.iso.date(),
      portfolio: z.number(),
      benchmark: z.number(),
    }),
  ),
  portfolioReturnPercent: z.number(),
  benchmarkReturnPercent: z.number(),
});
export type PerformanceSeries = z.infer<typeof PerformanceSeriesSchema>;

/* ------------------------------------------------------------------ Orders */

export const OrderSideSchema = z.enum(['BUY', 'SELL']);
export type OrderSide = z.infer<typeof OrderSideSchema>;

export const OrderTypeSchema = z.enum(['MARKET', 'LIMIT']);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const TimeInForceSchema = z.enum(['DAY', 'GTC']);
export type TimeInForce = z.infer<typeof TimeInForceSchema>;

/**
 * Lifecycle: PENDING_APPROVAL -> NEW -> WORKING -> PARTIALLY_FILLED -> FILLED,
 * with CANCELLED / REJECTED as terminal side exits.
 */
export const OrderStatusSchema = z.enum([
  'PENDING_APPROVAL',
  'NEW',
  'WORKING',
  'PARTIALLY_FILLED',
  'FILLED',
  'CANCELLED',
  'REJECTED',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['FILLED', 'CANCELLED', 'REJECTED'];

export const RuleSeveritySchema = z.enum(['PASS', 'WARN', 'FAIL']);
export type RuleSeverity = z.infer<typeof RuleSeveritySchema>;

export const RuleResultSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  severity: RuleSeveritySchema,
  message: z.string(),
  current: z.number().nullable(),
  projected: z.number().nullable(),
  limit: z.number().nullable(),
});
export type RuleResult = z.infer<typeof RuleResultSchema>;

export const ComplianceCheckResultSchema = z.object({
  outcome: RuleSeveritySchema,
  requiresApproval: z.boolean(),
  results: z.array(RuleResultSchema),
  checkedAt: isoDateTime,
});
export type ComplianceCheckResult = z.infer<typeof ComplianceCheckResultSchema>;

export const FillSchema = z.object({
  id: z.string(),
  quantity: z.number().positive(),
  price: z.number().positive(),
  venue: z.string(),
  timestamp: isoDateTime,
});
export type Fill = z.infer<typeof FillSchema>;

export const OrderSchema = z.object({
  id: z.string(),
  portfolioId: z.string(),
  portfolioName: z.string(),
  symbol: z.string(),
  securityName: z.string(),
  side: OrderSideSchema,
  quantity: z.number().positive(),
  orderType: OrderTypeSchema,
  limitPrice: z.number().positive().nullable(),
  timeInForce: TimeInForceSchema,
  status: OrderStatusSchema,
  filledQuantity: z.number().nonnegative(),
  averageFillPrice: z.number().nullable(),
  estimatedNotional: z.number(),
  createdBy: PersonRefSchema,
  approvedBy: PersonRefSchema.nullable(),
  routedBy: PersonRefSchema.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  compliance: ComplianceCheckResultSchema,
  rationale: z.string().nullable(),
  fills: z.array(FillSchema),
});
export type Order = z.infer<typeof OrderSchema>;

export const OrderDraftSchema = z
  .object({
    portfolioId: z.string().min(1),
    symbol: z.string().min(1).max(12),
    side: OrderSideSchema,
    quantity: z
      .number()
      .int('Quantity must be a whole number')
      .positive('Quantity must be positive')
      .max(10_000_000),
    orderType: OrderTypeSchema,
    limitPrice: z.number().positive('Limit price must be positive').nullable(),
    timeInForce: TimeInForceSchema,
    rationale: z.string().max(500).nullable(),
  })
  .refine((draft) => draft.orderType === 'MARKET' || draft.limitPrice !== null, {
    message: 'Limit orders require a limit price',
    path: ['limitPrice'],
  });
export type OrderDraft = z.infer<typeof OrderDraftSchema>;

export const OrderActionSchema = z.object({ comment: z.string().max(500).optional() });
export type OrderAction = z.infer<typeof OrderActionSchema>;

/* -------------------------------------------------------------- Compliance */

export const ComplianceRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum([
    'issuer-concentration',
    'sector-concentration',
    'restricted-list',
    'minimum-cash',
    'order-notional',
  ]),
  limit: z.number().nullable(),
  breachSeverity: z.enum(['WARN', 'FAIL']),
  scope: z.string(),
});
export type ComplianceRule = z.infer<typeof ComplianceRuleSchema>;

export const RuleUtilizationSchema = z.object({
  ruleId: z.string(),
  portfolioId: z.string(),
  portfolioName: z.string(),
  value: z.number(),
  limit: z.number(),
  utilizationPercent: z.number(),
  status: ComplianceStatusSchema,
  driver: z.string().nullable(),
});
export type RuleUtilization = z.infer<typeof RuleUtilizationSchema>;

export const AlertStatusSchema = z.enum(['OPEN', 'APPROVED', 'REJECTED']);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

export const ComplianceAlertSchema = z.object({
  id: z.string(),
  orderId: z.string().nullable(),
  portfolioId: z.string(),
  portfolioName: z.string(),
  symbol: z.string().nullable(),
  ruleId: z.string(),
  ruleName: z.string(),
  severity: z.enum(['WARN', 'FAIL']),
  status: AlertStatusSchema,
  message: z.string(),
  raisedAt: isoDateTime,
  raisedBy: PersonRefSchema,
  resolvedAt: isoDateTime.nullable(),
  resolvedBy: PersonRefSchema.nullable(),
  resolutionComment: z.string().nullable(),
});
export type ComplianceAlert = z.infer<typeof ComplianceAlertSchema>;

export const AlertResolutionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().trim().min(3, 'A justification is required').max(500),
});
export type AlertResolution = z.infer<typeof AlertResolutionSchema>;
