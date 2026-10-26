import { CSRF_HEADER, ProblemType } from '@meridian/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { Config } from '../config';
import { safeEqual } from '../lib/crypto';
import { sendProblem } from './problem';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Endpoints that legitimately run without the CSRF header. */
const CSRF_EXEMPT = new Set([
  'POST /auth/login', // protected by the login-state token instead
  'POST /api/telemetry', // navigator.sendBeacon cannot set headers; write-only + rate limited
]);

function routeKey(request: FastifyRequest) {
  return `${request.method} ${request.url.split('?')[0]}`;
}

/**
 * Fetch Metadata resource isolation policy (web.dev/fetch-metadata): reject
 * cross-site requests outright, except top-level navigations. Browsers that
 * do not send the headers fall through to the CSRF and Origin checks.
 */
export function isAllowedByFetchMetadata(request: FastifyRequest): boolean {
  const site = request.headers['sec-fetch-site'];
  if (!site || site === 'same-origin' || site === 'same-site' || site === 'none') return true;
  const mode = request.headers['sec-fetch-mode'];
  const dest = request.headers['sec-fetch-dest'];
  return mode === 'navigate' && request.method === 'GET' && dest !== 'object' && dest !== 'embed';
}

export function registerSecurity(app: FastifyInstance, config: Config) {
  // W3C trace context: reuse the caller's trace id for log correlation.
  app.addHook('onRequest', async (request) => {
    const traceparent = request.headers['traceparent'];
    const match =
      typeof traceparent === 'string'
        ? /^00-([0-9a-f]{32})-[0-9a-f]{16}-0[01]$/.exec(traceparent)
        : null;
    request.traceId = match?.[1] ?? randomBytes(16).toString('hex');
    const client = request.headers['x-meridian-client'];
    request.log = request.log.child({
      traceId: request.traceId,
      // Bounded: a header is attacker-sized, a log line must not be.
      client: typeof client === 'string' ? client.slice(0, 64) : undefined,
    });
  });

  app.addHook('onRequest', async (request, reply) => {
    if (!isAllowedByFetchMetadata(request)) {
      request.log.warn(
        { site: request.headers['sec-fetch-site'] },
        'blocked by fetch metadata policy',
      );
      return sendProblem(request, reply, {
        type: ProblemType.Forbidden,
        title: 'Cross-site request blocked',
        status: 403,
      });
    }
    if (SAFE_METHODS.has(request.method)) return;

    const origin = request.headers.origin;
    // `Origin: null` is only trusted when the browser itself vouches the
    // request is same-origin (Sec-Fetch-Site cannot be set by scripts), which
    // keeps the sandboxed-iframe `null` origin trick blocked.
    const opaqueSameOrigin =
      origin === 'null' && request.headers['sec-fetch-site'] === 'same-origin';
    if (origin && !opaqueSameOrigin && !config.publicOrigins.includes(origin)) {
      return sendProblem(request, reply, {
        type: ProblemType.Forbidden,
        title: 'Origin not allowed',
        status: 403,
      });
    }
    if (CSRF_EXEMPT.has(routeKey(request))) return;
    const session = app.sessions.get(request.cookies[config.sessionCookieName]);
    const token = request.headers[CSRF_HEADER];
    if (session && (typeof token !== 'string' || !safeEqual(token, session.csrfToken))) {
      return sendProblem(request, reply, {
        type: ProblemType.CsrfRejected,
        title: 'CSRF token missing or invalid',
        status: 403,
      });
    }
  });

  // Financial data must never be cached by shared or browser caches.
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/auth/session')) {
      reply.header('cache-control', 'no-store');
    }
    reply.header('x-trace-id', request.traceId);
    return payload;
  });
}
