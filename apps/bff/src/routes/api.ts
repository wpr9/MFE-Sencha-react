import {
  AlertResolutionSchema,
  OrderActionSchema,
  OrderDraftSchema,
  OrderStatusSchema,
  Permission,
  PerformanceRangeSchema,
  TelemetryBatchSchema,
  apiPaths,
  type Order,
  type PortfolioDetail,
  type PortfolioSummary,
} from '@meridian/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  actor,
  assertPortfolioAccess,
  canAccessPortfolio,
  hasPermission,
  requirePermission,
  requireSession,
  sessionOf,
} from '../auth/guards';
import type { ServerSession } from '../auth/session-store';
import { notFound, validation } from '../domain/errors';
import { toSummary } from '../domain/portfolios';
import { SECURITIES, getSecurity, toSecurity } from '../domain/securities';

const API = '/api';

/*
 * Query strings are untrusted input like bodies: validated, bounded and typed.
 * (A repeated key arrives as an array and is rejected as a 422 problem.)
 */
const term = z.string().trim().max(64);
const SecuritiesQuery = z.object({ q: term.optional() });
const QuotesQuery = z.object({ symbols: z.string().max(2_000).optional() });
const OrdersQuery = z.object({
  portfolioId: term.optional(),
  symbol: term.optional(),
  status: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
const AlertsQuery = z.object({ status: term.optional() });

/** Search results are capped; without a search term the full security master is returned. */
const MAX_SEARCH_RESULTS = 50;
const DEFAULT_ORDER_LIMIT = 500;

/** Compliance posture is need-to-know: hidden from callers without `compliance:read`. */
function withComplianceVisibility<T extends PortfolioSummary>(
  session: ServerSession,
  portfolio: T,
): T {
  return hasPermission(session, Permission.ComplianceRead)
    ? portfolio
    : ({ ...portfolio, complianceStatus: null, openAlerts: null } as T);
}

/**
 * REST API of the BFF. Every route runs behind `requireSession`, then checks
 * the permission it needs (RBAC) and the portfolio entitlement of the data it
 * touches (ABAC). Bodies and query strings are validated with the schemas the
 * clients share, so both sides agree on the contract.
 */
export async function apiRoutes(app: FastifyInstance) {
  const { domain, config } = app;
  const { book, market, orders, compliance } = domain;

  app.addHook('preHandler', requireSession);
  if (config.simulatedLatencyMs > 0) {
    // Development only: makes loading states visible. Off in production by default.
    app.addHook('preHandler', async () => {
      const jitter = config.simulatedLatencyMs * (0.5 + Math.random());
      await new Promise((resolve) => setTimeout(resolve, jitter));
    });
  }

  /** A portfolio with its compliance posture, valued once per request. */
  const portfolioFor = (session: ServerSession, id: string): PortfolioDetail => {
    const detail = book.detail(id);
    if (!detail) throw notFound(`Portfolio ${id}`);
    // 404 before 403 on purpose: portfolio ids are a fixed, public set, so existence is
    // not a secret, and the 403 only echoes the id the caller sent.
    assertPortfolioAccess(session, id);
    const { status, openAlerts } = compliance.portfolioStatus(id, detail);
    return withComplianceVisibility(session, {
      ...detail,
      complianceStatus: status,
      openAlerts,
    });
  };

  /**
   * An order the caller may see. Entitlement failures answer 404, exactly like a
   * missing order: ids are sequential, so a 403 naming the portfolio would let a
   * user enumerate other desks' order flow one id at a time.
   */
  const orderFor = (session: ServerSession, id: string): Order => {
    const order = orders.get(id);
    if (!canAccessPortfolio(session, order.portfolioId)) throw notFound(`Order ${id}`);
    return order;
  };

  /* ---------------------------------------------------------- Portfolios */

  app.get(
    `${API}${apiPaths.portfolios()}`,
    { preHandler: requirePermission(Permission.PortfolioRead) },
    async (request) => {
      const session = sessionOf(request);
      return book
        .ids()
        .filter((id) => canAccessPortfolio(session, id))
        .map((id) => toSummary(portfolioFor(session, id)));
    },
  );

  app.get<{ Params: { id: string } }>(
    `${API}/portfolios/:id`,
    { preHandler: requirePermission(Permission.PortfolioRead) },
    async (request) => portfolioFor(sessionOf(request), request.params.id),
  );

  app.get<{ Params: { id: string }; Querystring: { range?: string } }>(
    `${API}/portfolios/:id/performance`,
    { preHandler: requirePermission(Permission.PortfolioRead) },
    async (request) => {
      const { id } = request.params;
      if (!book.exists(id)) throw notFound(`Portfolio ${id}`);
      assertPortfolioAccess(sessionOf(request), id);
      const range = PerformanceRangeSchema.parse(request.query.range ?? '1Y'); // 422 on garbage
      return book.performance(id, range);
    },
  );

  /* ---------------------------------------------------------- Market data */

  app.get(
    `${API}${apiPaths.securities()}`,
    { preHandler: requirePermission(Permission.MarketDataRead) },
    async (request) => {
      const query = (SecuritiesQuery.parse(request.query).q ?? '').toLowerCase();
      const matches = SECURITIES.filter(
        (s) =>
          !query || s.symbol.toLowerCase().includes(query) || s.name.toLowerCase().includes(query),
      );
      return (query ? matches.slice(0, MAX_SEARCH_RESULTS) : matches).map(toSecurity);
    },
  );

  app.get(
    `${API}${apiPaths.quotes()}`,
    { preHandler: requirePermission(Permission.MarketDataRead) },
    async (request) =>
      market.getQuotes(
        QuotesQuery.parse(request.query)
          .symbols?.split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      ),
  );

  app.get<{ Params: { symbol: string } }>(
    `${API}/quotes/:symbol/intraday`,
    { preHandler: requirePermission(Permission.MarketDataRead) },
    async (request) => {
      const symbol = request.params.symbol.toUpperCase();
      const points = market.intraday(symbol);
      if (!points) throw notFound(`Security ${symbol}`);
      return { symbol, points };
    },
  );

  /* -------------------------------------------------------------- Orders */

  app.get(
    `${API}${apiPaths.orders()}`,
    { preHandler: requirePermission(Permission.OrderRead) },
    async (request) => {
      const session = sessionOf(request);
      const query = OrdersQuery.parse(request.query);
      const statuses = query.status
        ? z.array(OrderStatusSchema).parse(query.status.split(','))
        : null;
      const symbol = query.symbol?.toUpperCase();
      return orders
        .list(
          (order) =>
            canAccessPortfolio(session, order.portfolioId) &&
            (!query.portfolioId || order.portfolioId === query.portfolioId) &&
            (!symbol || order.symbol === symbol) &&
            (!statuses || statuses.includes(order.status)),
        )
        .slice(0, query.limit ?? DEFAULT_ORDER_LIMIT);
    },
  );

  app.get<{ Params: { id: string } }>(
    `${API}/orders/:id`,
    { preHandler: requirePermission(Permission.OrderRead) },
    async (request) => orderFor(sessionOf(request), request.params.id),
  );

  app.post(
    `${API}${apiPaths.orders()}`,
    { preHandler: requirePermission(Permission.OrderCreate) },
    async (request, reply) => {
      const session = sessionOf(request);
      const draft = OrderDraftSchema.parse(request.body);
      assertPortfolioAccess(session, draft.portfolioId);
      const order = orders.create(draft, actor(session));
      request.log.info({ orderId: order.id, status: order.status }, 'order created');
      return reply.code(201).header('location', `${API}/orders/${order.id}`).send(order);
    },
  );

  app.post<{ Params: { id: string } }>(
    `${API}/orders/:id/approve`,
    { preHandler: requirePermission(Permission.OrderApprove) },
    async (request) => {
      const session = sessionOf(request);
      const { comment } = OrderActionSchema.parse(request.body ?? {});
      const order = orderFor(session, request.params.id);
      return orders.approve(order.id, actor(session), comment ?? 'Approved.');
    },
  );

  app.post<{ Params: { id: string } }>(
    `${API}/orders/:id/reject`,
    { preHandler: requirePermission(Permission.OrderApprove) },
    async (request) => {
      const session = sessionOf(request);
      const { comment } = OrderActionSchema.parse(request.body ?? {});
      const order = orderFor(session, request.params.id);
      return orders.reject(order.id, actor(session), comment ?? 'Rejected.');
    },
  );

  app.post<{ Params: { id: string } }>(
    `${API}/orders/:id/route`,
    { preHandler: requirePermission(Permission.OrderRoute) },
    async (request) => {
      const session = sessionOf(request);
      const order = orderFor(session, request.params.id);
      return orders.route(order.id, actor(session));
    },
  );

  app.post<{ Params: { id: string } }>(
    `${API}/orders/:id/cancel`,
    { preHandler: requirePermission(Permission.OrderCancel) },
    async (request) => {
      const session = sessionOf(request);
      const order = orderFor(session, request.params.id);
      // Traders may cancel any working order; portfolio managers only their own.
      const canCancelAny = hasPermission(session, Permission.OrderRoute);
      return orders.cancel(order.id, actor(session), canCancelAny);
    },
  );

  /* ---------------------------------------------------------- Compliance */

  app.post(
    `${API}${apiPaths.complianceCheck()}`,
    { preHandler: requirePermission(Permission.OrderCreate) },
    async (request) => {
      const draft = OrderDraftSchema.parse(request.body);
      if (!book.exists(draft.portfolioId)) throw notFound(`Portfolio ${draft.portfolioId}`);
      assertPortfolioAccess(sessionOf(request), draft.portfolioId);
      // The answer `POST /orders` would give: a 422, not a FAIL verdict with no rule behind it.
      if (!getSecurity(draft.symbol)) {
        throw validation(`Unknown security ${draft.symbol}.`, [
          { path: 'symbol', message: 'Unknown security' },
        ]);
      }
      return compliance.check(draft);
    },
  );

  app.get(
    `${API}${apiPaths.complianceRules()}`,
    { preHandler: requirePermission(Permission.ComplianceRead) },
    async () => compliance.rules(),
  );

  app.get(
    `${API}${apiPaths.complianceUtilization()}`,
    { preHandler: requirePermission(Permission.ComplianceRead) },
    async (request) => {
      const session = sessionOf(request);
      return book
        .ids()
        .filter((id) => canAccessPortfolio(session, id))
        .flatMap((id) => compliance.utilizationFor(id));
    },
  );

  app.get(
    `${API}${apiPaths.complianceAlerts()}`,
    { preHandler: requirePermission(Permission.ComplianceRead) },
    async (request) => {
      const session = sessionOf(request);
      const { status } = AlertsQuery.parse(request.query);
      const manager = hasPermission(session, Permission.ComplianceManage);
      return compliance.listAlerts(
        (alert) =>
          canAccessPortfolio(session, alert.portfolioId) &&
          (manager || alert.raisedBy.id === session.persona.user.id) &&
          (!status || alert.status === status),
      );
    },
  );

  app.post<{ Params: { id: string } }>(
    `${API}/compliance/alerts/:id/resolution`,
    { preHandler: requirePermission(Permission.ComplianceManage, Permission.OrderApprove) },
    async (request) => {
      const session = sessionOf(request);
      const resolution = AlertResolutionSchema.parse(request.body);
      const alert = compliance.getAlert(request.params.id);
      if (!alert || !alert.orderId) throw notFound(`Alert ${request.params.id}`);
      assertPortfolioAccess(session, alert.portfolioId);
      const by = actor(session);
      const order =
        resolution.decision === 'APPROVE'
          ? orders.approve(alert.orderId, by, resolution.comment)
          : orders.reject(alert.orderId, by, resolution.comment);
      return { alert: compliance.getAlert(alert.id), order };
    },
  );

  /* ---------------------------------------------------------- Telemetry */

  app.post(
    `${API}${apiPaths.telemetry()}`,
    // Beacons can arrive in bursts (page hide); the body cap matches the client's batch size.
    { bodyLimit: 256 * 1024, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = TelemetryBatchSchema.parse(request.body);
      for (const record of body.records) {
        // Errors are logged as a bounded projection: a client may send 50 records per beacon
        // and 120 beacons a minute, and a log line must never be attacker-sized.
        if (record.kind === 'error') {
          const { error } = record;
          request.log.warn(
            {
              source: record.source,
              path: record.path,
              error: error && {
                name: error.name,
                message: error.message,
                stack: error.stack?.slice(0, 1_024),
              },
            },
            'client error',
          );
        } else if (record.kind === 'vital')
          request.log.info(
            { vital: record.name, value: record.value, source: record.source },
            'web vital',
          );
        else request.log.debug({ telemetry: record }, 'client telemetry');
      }
      return reply.code(204).send();
    },
  );
}
