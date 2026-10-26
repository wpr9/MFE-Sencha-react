import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { authRoutes } from './auth/routes';
import { SessionStore } from './auth/session-store';
import type { Config } from './config';
import { createDomain, type Domain } from './domain';
import { registerErrorHandling } from './http/problem';
import { registerSecurity } from './http/security';
import { apiRoutes } from './routes/api';
import { streamRoutes } from './routes/stream';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    sessions: SessionStore;
    domain: Domain;
  }
}

/**
 * Mock Backend-for-Frontend. Architecturally faithful to a production BFF:
 * server-side sessions behind an HttpOnly cookie (tokens never reach the
 * browser), CSRF + Fetch Metadata + Origin defence, RBAC/entitlement checks on
 * every route and on pushed events, RFC 9457 errors and trace propagation.
 * Only the identity provider and the back-office systems are simulated.
 */
export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'],
      ...(config.isProduction
        ? {}
        : {
            transport: {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }),
    },
    // Largest legitimate body is an order draft; telemetry raises its own limit per route.
    bodyLimit: 64 * 1024,
    // Trust only the first N hops from the socket (proxy-addr semantics for a hop count).
    trustProxy: (_address, hop) => hop < config.TRUST_PROXY_HOPS,
  });

  app.decorate('config', config);
  app.decorate(
    'sessions',
    new SessionStore({
      idleTimeoutSeconds: config.SESSION_IDLE_TIMEOUT_SECONDS,
      absoluteTimeoutSeconds: config.SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    }),
  );
  app.decorate(
    'domain',
    createDomain({ seed: config.SIMULATION_SEED, tickMs: config.MARKET_TICK_MS }),
  );
  app.decorateRequest('session', null);
  app.decorateRequest('traceId', '');

  await app.register(cookie);
  await app.register(formbody);
  await app.register(helmet, {
    // The BFF only serves JSON, SSE and the self-contained sign-in page (which sets its own CSP).
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    // Not helmet's default `no-referrer`: under that policy browsers send
    // `Origin: null` on same-origin form posts (sign-in), defeating the
    // Origin allow-list. `same-origin` still leaks nothing cross-site.
    referrerPolicy: { policy: 'same-origin' },
    hsts: config.isProduction,
  });
  await app.register(rateLimit, {
    // ~10 requests/s per session covers a busy tab (grids, quotes snapshot, what-if checks).
    max: 600,
    timeWindow: '1 minute',
    // Key on a *validated* session, never on the raw cookie (an attacker could
    // rotate junk values to get fresh buckets); otherwise on the client address.
    // The session id is a bearer secret, so only its hash is used as a key.
    keyGenerator: (request) => {
      const session = app.sessions.get(request.cookies[config.sessionCookieName]);
      return session
        ? `session:${createHash('sha256').update(session.id).digest('base64url')}`
        : `ip:${request.ip}`;
    },
  });

  registerSecurity(app, config);
  registerErrorHandling(app);

  // Liveness: exempt from rate limiting (clients must not be able to evict the BFF) and
  // from request logging (probes every few seconds would drown the log).
  app.get('/healthz', { logLevel: 'warn', config: { rateLimit: false } }, async () => ({
    status: 'ok',
  }));
  await app.register(authRoutes);
  await app.register(streamRoutes);
  await app.register(apiRoutes);

  app.addHook('onReady', async () => app.domain.start());
  app.addHook('onClose', async () => {
    app.domain.stop();
    app.sessions.dispose();
  });
  return app;
}
