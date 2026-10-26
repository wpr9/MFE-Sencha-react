import { Permission, ProblemType, apiPaths, type StreamEvent } from '@meridian/contracts';
import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import { canAccessPortfolio, hasPermission, requireSession, sessionOf } from '../auth/guards';
import type { ServerSession } from '../auth/session-store';
import type { HubEntry } from '../domain/events';
import { sendProblem } from '../http/problem';

/**
 * Streams are long-lived, so the request rate limiter cannot bound them. One
 * per tab is normal; a few cover several open tabs. Beyond that a session is
 * refused rather than allowed to multiply fan-out work and sockets.
 */
const MAX_STREAMS_PER_SESSION = 5;
/** Comment frames keep intermediaries from closing an idle connection. */
const HEARTBEAT_MS = 15_000;
/** How long a disconnected EventSource waits before reconnecting. */
const CLIENT_RETRY_MS = 3_000;

/**
 * Authorization applies to pushed data too: each connection only receives
 * events for portfolios the user is entitled to, gated by permission.
 */
function canReceive(session: ServerSession, event: StreamEvent): boolean {
  switch (event.type) {
    case 'quotes':
      return hasPermission(session, Permission.MarketDataRead);
    case 'order.created':
    case 'order.updated':
      return (
        hasPermission(session, Permission.OrderRead) &&
        canAccessPortfolio(session, event.order.portfolioId)
      );
    case 'alert.raised':
    case 'alert.updated':
      return (
        hasPermission(session, Permission.ComplianceRead) &&
        canAccessPortfolio(session, event.alert.portfolioId) &&
        (hasPermission(session, Permission.ComplianceManage) ||
          event.alert.raisedBy.id === session.persona.user.id)
      );
    case 'portfolio.changed':
      return (
        hasPermission(session, Permission.PortfolioRead) &&
        canAccessPortfolio(session, event.portfolioId)
      );
    case 'session.ended':
      return true;
  }
}

const frame = (entry: HubEntry) =>
  `${entry.id === null ? '' : `id: ${entry.id}\n`}event: ${entry.event.type}\ndata: ${entry.data}\n\n`;

/** `GET /api/stream`: Server-Sent Events, resumable from `Last-Event-ID`. */
export async function streamRoutes(app: FastifyInstance) {
  const openStreams = new Map<string, number>();
  const responses = new Set<ServerResponse>();

  // Hijacked responses are never idle, so `server.close()` would wait for them
  // forever: end every stream before the server closes. Clients reconnect to
  // the next instance and resume from their last event id.
  app.addHook('preClose', async () => {
    for (const raw of responses) raw.end();
  });

  app.get<{ Querystring: { lastEventId?: string } }>(
    `/api${apiPaths.stream()}`,
    { preHandler: requireSession },
    (request, reply) => {
      const session = sessionOf(request);
      const { hub } = app.domain;
      const open = openStreams.get(session.id) ?? 0;
      if (open >= MAX_STREAMS_PER_SESSION) {
        request.log.warn(
          { user: session.persona.user.id, open },
          'stream refused: per-session cap',
        );
        void sendProblem(request, reply, {
          type: ProblemType.RateLimited,
          title: 'Too many open streams',
          status: 429,
          detail: `At most ${MAX_STREAMS_PER_SESSION} live connections per session. Close other tabs and retry.`,
        });
        return;
      }
      openStreams.set(session.id, open + 1);
      reply.hijack();
      const raw = reply.raw;
      responses.add(raw);
      raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'x-trace-id': request.traceId,
      });
      // A write after `end()` (a hub event in the same tick as a close) would raise an
      // error event on the response; the guard makes every late write a no-op.
      const send = (chunk: string) => {
        if (!raw.writableEnded && !raw.destroyed) raw.write(chunk);
      };
      send(`retry: ${CLIENT_RETRY_MS}\n\n`);

      const write = (entry: HubEntry) => {
        if (canReceive(session, entry.event)) send(frame(entry));
      };

      // Resume point: a non-negative integer or nothing (`Number('')` would be 0 and
      // replay the whole buffer).
      const resumeFrom = request.headers['last-event-id'] ?? request.query.lastEventId;
      if (typeof resumeFrom === 'string' && /^\d{1,15}$/.test(resumeFrom)) {
        for (const entry of hub.replaySince(Number(resumeFrom))) write(entry);
      }

      const unsubscribe = hub.subscribe(write);
      const heartbeat = setInterval(() => send(': keep-alive\n\n'), HEARTBEAT_MS);
      const stopOnSessionEnd = app.sessions.onEnded((sessionId, reason) => {
        if (sessionId !== session.id) return;
        const event: StreamEvent = { type: 'session.ended', reason };
        write({ id: null, event, data: JSON.stringify(event) });
        raw.end();
      });

      request.log.info({ user: session.persona.user.id }, 'stream opened');
      request.raw.on('close', () => {
        const remaining = (openStreams.get(session.id) ?? 1) - 1;
        if (remaining > 0) openStreams.set(session.id, remaining);
        else openStreams.delete(session.id);
        responses.delete(raw);
        unsubscribe();
        stopOnSessionEnd();
        clearInterval(heartbeat);
        request.log.info({ user: session.persona.user.id }, 'stream closed');
      });
    },
  );
}
