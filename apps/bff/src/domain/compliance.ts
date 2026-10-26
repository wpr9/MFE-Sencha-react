import type {
  ComplianceAlert,
  ComplianceCheckResult,
  ComplianceRule,
  ComplianceStatus,
  OrderDraft,
  PersonRef,
  PortfolioDetail,
  RuleResult,
  RuleSeverity,
  RuleUtilization,
  Security,
} from '@meridian/contracts';
import type { MarketSimulator } from './market';
import type { PortfolioBook } from './portfolios';
import { referencePrice } from './pricing';
import { round } from './random';
import { getSecurity } from './securities';

/** Per-portfolio sector limits (percent of NAV); every other portfolio uses the default. */
const DEFAULT_SECTOR_LIMIT = 35;
const SECTOR_LIMITS: Readonly<Record<string, number>> = { TEC: 75, GEQ: 50, ESG: 45 };
const sectorLimit = (portfolioId: string) => SECTOR_LIMITS[portfolioId] ?? DEFAULT_SECTOR_LIMIT;

/** Firm-wide restricted list (e.g. pending advisory mandate / MNPI). */
const RESTRICTED = new Set(['DIS']);
/** The ESG mandate excludes this GICS sector from purchases. */
const ESG_PORTFOLIO = 'ESG';
const ESG_EXCLUDED_SECTOR = 'Energy';

/** Utilisation thresholds: at 90% of a limit a portfolio is "near limit", at 100% in breach. */
const WARNING_UTILIZATION = 90;
const BREACH_UTILIZATION = 100;

/**
 * The rulebook. Limits live here and nowhere else: the evaluators below and
 * the utilisation meters read them from this table.
 */
export const RULES: readonly ComplianceRule[] = [
  {
    id: 'R-ISSUER',
    name: 'Single issuer limit',
    description: 'No single equity issuer may exceed 10% of NAV.',
    kind: 'issuer-concentration',
    limit: 10,
    breachSeverity: 'WARN',
    scope: 'All portfolios (equities)',
  },
  {
    id: 'R-SECTOR',
    name: 'Sector concentration',
    description: `No GICS sector may exceed ${DEFAULT_SECTOR_LIMIT}% of NAV (${Object.entries(
      SECTOR_LIMITS,
    )
      .map(([id, limit]) => `${limit}% for ${id}`)
      .join(', ')}).`,
    kind: 'sector-concentration',
    limit: DEFAULT_SECTOR_LIMIT,
    breachSeverity: 'WARN',
    scope: 'All portfolios',
  },
  {
    id: 'R-RESTRICTED',
    name: 'Firm restricted list',
    description: 'Securities on the firm-wide restricted list may not be bought.',
    kind: 'restricted-list',
    limit: null,
    breachSeverity: 'FAIL',
    scope: 'All portfolios',
  },
  {
    id: 'R-ESG',
    name: 'ESG exclusion: fossil fuels',
    description: `Sustainable Leaders may not purchase ${ESG_EXCLUDED_SECTOR}-sector securities.`,
    kind: 'restricted-list',
    limit: null,
    breachSeverity: 'FAIL',
    scope: 'Sustainable Leaders',
  },
  {
    id: 'R-CASH',
    name: 'Minimum cash buffer',
    description: 'Cash must remain at or above 1% of NAV after a purchase.',
    kind: 'minimum-cash',
    limit: 1,
    breachSeverity: 'WARN',
    scope: 'All portfolios',
  },
  {
    id: 'R-NOTIONAL',
    name: 'Large order review',
    description: 'Orders above $25M notional require compliance approval.',
    kind: 'order-notional',
    limit: 25_000_000,
    breachSeverity: 'WARN',
    scope: 'All portfolios',
  },
];

type RuleId = 'R-ISSUER' | 'R-SECTOR' | 'R-RESTRICTED' | 'R-ESG' | 'R-CASH' | 'R-NOTIONAL';

const ruleById = (id: RuleId): ComplianceRule => {
  const rule = RULES.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`Unknown compliance rule ${id}`);
  return rule;
};
const limitOf = (id: RuleId): number => ruleById(id).limit ?? 0;

/** The portfolio before and after the order, in the units the rules reason about (% of NAV). */
interface Projection {
  readonly portfolioId: string;
  readonly security: Security;
  readonly buying: boolean;
  readonly notional: number;
  readonly positionBefore: number;
  readonly positionAfter: number;
  readonly sectorBefore: number;
  readonly sectorAfter: number;
  readonly cashBefore: number;
  readonly cashAfter: number;
}

interface Verdict {
  readonly breached: boolean;
  readonly message: string;
  readonly current: number | null;
  readonly projected: number | null;
  /** Overrides the rule's generic limit (per-portfolio sector limits). */
  readonly limit?: number;
}

/** One pre-trade rule: when it applies and what it finds. */
interface Evaluator {
  readonly id: RuleId;
  applies(projection: Projection): boolean;
  evaluate(projection: Projection): Verdict;
}

const EVALUATORS: readonly Evaluator[] = [
  {
    id: 'R-ISSUER',
    applies: (p) => p.security.assetClass === 'Equity',
    evaluate: (p) => {
      const limit = limitOf('R-ISSUER');
      const breached = p.buying && p.positionAfter > limit;
      return {
        breached,
        message: breached
          ? `${p.security.symbol} would reach ${round(p.positionAfter, 2)}% of NAV (limit ${limit}%).`
          : `${p.security.symbol} at ${round(p.positionAfter, 2)}% of NAV after trade.`,
        current: p.positionBefore,
        projected: p.positionAfter,
      };
    },
  },
  {
    id: 'R-SECTOR',
    applies: () => true,
    evaluate: (p) => {
      const limit = sectorLimit(p.portfolioId);
      const breached = p.buying && p.sectorAfter > limit;
      return {
        breached,
        message: breached
          ? `${p.security.sector} would reach ${round(p.sectorAfter, 1)}% (limit ${limit}%).`
          : `${p.security.sector} at ${round(p.sectorAfter, 1)}% after trade.`,
        current: p.sectorBefore,
        projected: p.sectorAfter,
        limit,
      };
    },
  },
  {
    id: 'R-RESTRICTED',
    applies: () => true,
    evaluate: (p) => {
      const breached = p.buying && RESTRICTED.has(p.security.symbol);
      return {
        breached,
        message: breached
          ? `${p.security.symbol} is on the firm restricted list.`
          : 'Not on the restricted list.',
        current: null,
        projected: null,
      };
    },
  },
  {
    id: 'R-ESG',
    applies: (p) => p.portfolioId === ESG_PORTFOLIO,
    evaluate: (p) => {
      const breached = p.buying && p.security.sector === ESG_EXCLUDED_SECTOR;
      return {
        breached,
        message: breached
          ? `${ESG_EXCLUDED_SECTOR}-sector purchases are excluded for this fund.`
          : 'Not an excluded sector.',
        current: null,
        projected: null,
      };
    },
  },
  {
    id: 'R-CASH',
    applies: (p) => p.buying,
    evaluate: (p) => {
      const limit = limitOf('R-CASH');
      const breached = p.cashAfter < limit;
      return {
        breached,
        message: breached
          ? `Cash would fall to ${round(p.cashAfter, 2)}% of NAV (minimum ${limit}%).`
          : `Cash ${round(p.cashAfter, 2)}% of NAV after trade.`,
        current: p.cashBefore,
        projected: p.cashAfter,
      };
    },
  },
  {
    id: 'R-NOTIONAL',
    applies: () => true,
    evaluate: (p) => {
      const limit = limitOf('R-NOTIONAL');
      const breached = p.notional > limit;
      return {
        breached,
        message: breached
          ? `Notional ${Math.round(p.notional / 1e6)}M exceeds the ${Math.round(limit / 1e6)}M review threshold.`
          : 'Below the review threshold.',
        current: p.notional,
        projected: null,
      };
    },
  },
];

const severityRank: Record<RuleSeverity, number> = { PASS: 0, WARN: 1, FAIL: 2 };

const utilizationStatus = (percent: number): ComplianceStatus =>
  percent >= BREACH_UTILIZATION ? 'breach' : percent >= WARNING_UTILIZATION ? 'warning' : 'ok';

/**
 * Pre-trade compliance and the alert book. `check()` is the same evaluation
 * the order ticket shows as the user types and the order book enforces on
 * submit; a WARN outcome routes the order to a compliance officer (four eyes),
 * a FAIL blocks it.
 */
export class ComplianceEngine {
  private readonly alerts = new Map<string, ComplianceAlert>();
  private sequence = 3100;

  constructor(
    private readonly book: PortfolioBook,
    private readonly market: MarketSimulator,
  ) {}

  rules(): readonly ComplianceRule[] {
    return RULES;
  }

  /** Projects the portfolio after the order and evaluates every applicable rule. */
  check(
    draft: Pick<
      OrderDraft,
      'portfolioId' | 'symbol' | 'side' | 'quantity' | 'orderType' | 'limitPrice'
    >,
  ): ComplianceCheckResult {
    const detail = this.book.detail(draft.portfolioId);
    const security = getSecurity(draft.symbol);
    if (!detail || !security) {
      return { outcome: 'FAIL', requiresApproval: false, results: [], checkedAt: now() };
    }
    const projection = this.project(detail, security, draft);
    const results: RuleResult[] = EVALUATORS.filter((evaluator) =>
      evaluator.applies(projection),
    ).map((evaluator) => {
      const rule = ruleById(evaluator.id);
      const verdict = evaluator.evaluate(projection);
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        severity: verdict.breached ? rule.breachSeverity : 'PASS',
        message: verdict.message,
        current: verdict.current === null ? null : round(verdict.current, 2),
        projected: verdict.projected === null ? null : round(verdict.projected, 2),
        limit: verdict.limit ?? rule.limit,
      };
    });
    const outcome = results.reduce<RuleSeverity>(
      (worst, r) => (severityRank[r.severity] > severityRank[worst] ? r.severity : worst),
      'PASS',
    );
    return { outcome, requiresApproval: outcome === 'WARN', results, checkedAt: now() };
  }

  private project(
    detail: PortfolioDetail,
    security: Security,
    draft: Pick<OrderDraft, 'portfolioId' | 'side' | 'quantity' | 'orderType' | 'limitPrice'>,
  ): Projection {
    const notional = referencePrice(draft, this.market.lastPrice(security.symbol)) * draft.quantity;
    const signed = draft.side === 'BUY' ? notional : -notional;
    const { nav } = detail;
    const held = detail.holdings.find((h) => h.symbol === security.symbol)?.marketValue ?? 0;
    const sectorBefore =
      detail.exposures.sector.find((e) => e.key === security.sector)?.weightPercent ?? 0;
    return {
      portfolioId: draft.portfolioId,
      security,
      buying: draft.side === 'BUY',
      notional,
      positionBefore: (held / nav) * 100,
      positionAfter: ((held + signed) / nav) * 100,
      sectorBefore,
      sectorAfter: sectorBefore + (signed / nav) * 100,
      cashBefore: (detail.cash / nav) * 100,
      cashAfter: ((detail.cash - signed) / nav) * 100,
    };
  }

  raiseAlert(input: {
    orderId: string;
    portfolioId: string;
    symbol: string;
    check: ComplianceCheckResult;
    raisedBy: PersonRef;
    raisedAt?: string;
  }): ComplianceAlert {
    const breaches = input.check.results.filter((r) => r.severity !== 'PASS');
    const alert: ComplianceAlert = {
      id: `ALT-${(this.sequence += 1)}`,
      orderId: input.orderId,
      portfolioId: input.portfolioId,
      portfolioName: this.book.name(input.portfolioId),
      symbol: input.symbol,
      ruleId: breaches[0]?.ruleId ?? 'R-UNKNOWN',
      ruleName: breaches.map((b) => b.ruleName).join(', '),
      severity: input.check.outcome === 'FAIL' ? 'FAIL' : 'WARN',
      status: 'OPEN',
      message: breaches.map((b) => b.message).join(' '),
      raisedAt: input.raisedAt ?? now(),
      raisedBy: input.raisedBy,
      resolvedAt: null,
      resolvedBy: null,
      resolutionComment: null,
    };
    this.alerts.set(alert.id, alert);
    return alert;
  }

  resolveForOrder(
    orderId: string,
    status: 'APPROVED' | 'REJECTED',
    by: PersonRef,
    comment: string,
  ): ComplianceAlert | undefined {
    const alert = [...this.alerts.values()].find(
      (a) => a.orderId === orderId && a.status === 'OPEN',
    );
    if (!alert) return undefined;
    const resolved: ComplianceAlert = {
      ...alert,
      status,
      resolvedAt: now(),
      resolvedBy: by,
      resolutionComment: comment,
    };
    this.alerts.set(alert.id, resolved);
    return resolved;
  }

  getAlert(id: string): ComplianceAlert | undefined {
    return this.alerts.get(id);
  }

  listAlerts(filter: (alert: ComplianceAlert) => boolean = () => true): ComplianceAlert[] {
    return [...this.alerts.values()]
      .filter(filter)
      .sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
  }

  /**
   * Posture badge for a portfolio. Pass the valued `detail` when the caller
   * already has it, so each request values a portfolio once.
   */
  portfolioStatus(
    portfolioId: string,
    detail?: PortfolioDetail,
  ): { status: ComplianceStatus; openAlerts: number } {
    const open = this.listAlerts((a) => a.portfolioId === portfolioId && a.status === 'OPEN');
    const utilization = this.utilizationFor(portfolioId, detail);
    const worst = utilization.some((u) => u.status === 'breach')
      ? 'breach'
      : utilization.some((u) => u.status === 'warning') || open.length
        ? 'warning'
        : 'ok';
    return { status: worst, openAlerts: open.length };
  }

  /** How close a portfolio sits to each limit, for the utilisation meters. */
  utilizationFor(portfolioId: string, detail?: PortfolioDetail): RuleUtilization[] {
    const portfolio = detail ?? this.book.detail(portfolioId);
    if (!portfolio) return [];
    const row = (
      ruleId: RuleId,
      value: number,
      limit: number,
      utilizationPercent: number,
      driver: string,
    ): RuleUtilization => ({
      ruleId,
      portfolioId,
      portfolioName: portfolio.name,
      value,
      limit,
      utilizationPercent: round(utilizationPercent, 1),
      status: utilizationStatus(utilizationPercent),
      driver,
    });
    const rows: RuleUtilization[] = [];
    const topIssuer = portfolio.holdings
      .filter((h) => h.assetClass === 'Equity')
      .sort((a, b) => b.weightPercent - a.weightPercent)[0];
    if (topIssuer) {
      const limit = limitOf('R-ISSUER');
      rows.push(
        row(
          'R-ISSUER',
          topIssuer.weightPercent,
          limit,
          (topIssuer.weightPercent / limit) * 100,
          `${topIssuer.symbol} ${topIssuer.weightPercent.toFixed(2)}%`,
        ),
      );
    }
    const topSector = portfolio.exposures.sector.filter((e) => e.key !== 'Cash')[0];
    if (topSector) {
      const limit = sectorLimit(portfolioId);
      rows.push(
        row(
          'R-SECTOR',
          topSector.weightPercent,
          limit,
          (topSector.weightPercent / limit) * 100,
          `${topSector.key} ${topSector.weightPercent.toFixed(1)}%`,
        ),
      );
    }
    // Minimum cash: utilisation grows as cash approaches the floor.
    const cashPct = (portfolio.cash / portfolio.nav) * 100;
    const cashFloor = limitOf('R-CASH');
    const cashUtilization =
      cashPct <= cashFloor ? BREACH_UTILIZATION : Math.min(99, (cashFloor / cashPct) * 100);
    rows.push(
      row('R-CASH', round(cashPct, 2), cashFloor, cashUtilization, `Cash ${cashPct.toFixed(2)}%`),
    );
    return rows;
  }
}

const now = () => new Date().toISOString();
