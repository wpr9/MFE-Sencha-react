import { ProblemType, authPaths } from '@meridian/contracts';
import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { sendProblem } from '../http/problem';
import { requireSession, sessionOf } from './guards';
import { renderLoginPage } from './login-page';
import { PERSONAS, findPersona } from './personas';
import { newLoginState, safeEqual } from '../lib/crypto';

const RETURN_TO_BASE = 'https://meridian.invalid';

const hasControlCharacter = (value: string) =>
  [...value].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f);

/**
 * Only same-origin relative paths: prevents open redirects via `returnTo`.
 * The value is resolved exactly as a browser would (which strips tab/CR/LF and
 * reads `\` as `/`, turning `/\t/evil.example` into `//evil.example`), and
 * the result must stay on our origin.
 */
export function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || hasControlCharacter(value)) return '/';
  let url: URL;
  try {
    url = new URL(value, RETURN_TO_BASE);
  } catch {
    return '/';
  }
  if (url.origin !== RETURN_TO_BASE || url.pathname.startsWith('/auth/')) return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Production bundles ship fonts next to main.cjs; development resolves them from node_modules. */
function fontFile(name: string, packagePath: string): string {
  const bundled = join(__dirname, 'assets', name);
  return existsSync(bundled) ? bundled : require.resolve(packagePath);
}

const FONT_FILES: Record<string, string> = {
  'google-sans.woff2': fontFile(
    'google-sans.woff2',
    '@fontsource-variable/google-sans/files/google-sans-latin-wght-normal.woff2',
  ),
  'roboto.woff2': fontFile(
    'roboto.woff2',
    '@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2',
  ),
};

export async function authRoutes(app: FastifyInstance) {
  const { config, sessions } = app;
  const cookieBase = { path: '/', httpOnly: true, secure: config.COOKIE_SECURE } as const;

  app.get<{ Querystring: { returnTo?: string; signedOut?: string; expired?: string } }>(
    authPaths.login,
    async (request, reply) => {
      const state = newLoginState();
      const nonce = randomBytes(16).toString('base64');
      reply.setCookie(config.loginStateCookieName, state, {
        ...cookieBase,
        sameSite: 'lax',
        maxAge: 600,
      });
      reply
        .header(
          'content-security-policy',
          `default-src 'none'; style-src 'nonce-${nonce}'; font-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
        )
        .header('cache-control', 'no-store')
        .type('text/html; charset=utf-8');
      return renderLoginPage({
        personas: PERSONAS,
        returnTo: sanitizeReturnTo(request.query.returnTo),
        state,
        nonce,
        notice: request.query.expired ? 'expired' : request.query.signedOut ? 'signed-out' : null,
      });
    },
  );

  app.post<{ Body: { persona?: string; returnTo?: string; state?: string } }>(
    authPaths.login,
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const expected = request.cookies[config.loginStateCookieName];
      const { persona: personaId, returnTo, state } = request.body ?? {};
      if (!expected || typeof state !== 'string' || !safeEqual(state, expected)) {
        return reply.redirect(
          `${authPaths.login}?returnTo=${encodeURIComponent(sanitizeReturnTo(returnTo))}`,
          303,
        );
      }
      const persona = typeof personaId === 'string' ? findPersona(personaId) : undefined;
      if (!persona)
        return sendProblem(request, reply, {
          type: ProblemType.Validation,
          title: 'Unknown account',
          status: 400,
        });

      // Always a brand-new session id at login (prevents session fixation).
      const previous = sessions.get(request.cookies[config.sessionCookieName]);
      if (previous) sessions.end(previous.id, 'logout');
      const session = sessions.create(persona);
      request.log.info({ user: persona.user.id }, 'signed in (mock idp)');
      reply.clearCookie(config.loginStateCookieName, { path: '/' });
      reply.setCookie(config.sessionCookieName, session.id, { ...cookieBase, sameSite: 'strict' });
      return reply.redirect(sanitizeReturnTo(returnTo), 303);
    },
  );

  app.post(authPaths.logout, async (request, reply) => {
    const session = sessions.get(request.cookies[config.sessionCookieName]);
    if (session) {
      sessions.end(session.id, 'logout');
      request.log.info({ user: session.persona.user.id }, 'signed out');
    }
    reply.clearCookie(config.sessionCookieName, { path: '/' });
    return reply.code(204).send();
  });

  app.get(authPaths.session, { preHandler: requireSession }, async (request) =>
    sessions.toDocument(sessionOf(request)),
  );

  app.post(authPaths.keepAlive, { preHandler: requireSession }, async (request) => {
    sessions.keepAlive(sessionOf(request));
    return sessions.toDocument(sessionOf(request));
  });

  /** Mock IdP only: let the idle timeout lapse in ~75 s to showcase the expiry UX. */
  if (config.AUTH_MODE === 'mock') {
    app.post('/auth/session/simulate-expiry', { preHandler: requireSession }, async (request) => {
      sessions.expireSoon(sessionOf(request), 75);
      return sessions.toDocument(sessionOf(request));
    });
  }

  app.get<{ Params: { file: string } }>('/auth/assets/:file', async (request, reply) => {
    const path = FONT_FILES[request.params.file];
    if (!path) return reply.callNotFound();
    reply.header('cache-control', 'public, max-age=31536000, immutable').type('font/woff2');
    return reply.send(createReadStream(path));
  });
}
