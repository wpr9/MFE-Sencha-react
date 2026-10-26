import {
  ProblemType,
  isPortfolioEntitled,
  type Permission,
  type PersonRef,
} from '@meridian/contracts';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { forbidden, unauthenticated } from '../domain/errors';
import { sendProblem } from '../http/problem';
import type { ServerSession } from './session-store';

const unauthenticatedProblem = () => {
  const error = unauthenticated();
  return { type: error.type, title: error.title, status: error.status, detail: error.message };
};

declare module 'fastify' {
  interface FastifyRequest {
    session: ServerSession | null;
    traceId: string;
  }
}

/** Authentication: resolves the opaque session cookie to a server-side session. */
export const requireSession: preHandlerAsyncHookHandler = async function (request, reply) {
  const session = this.sessions.get(request.cookies[this.config.sessionCookieName]);
  if (!session) return sendProblem(request, reply, unauthenticatedProblem());
  request.session = session;
};

/**
 * The session of an authenticated request. Routes run behind `requireSession`,
 * so this never throws in practice; it encodes that invariant once instead of
 * a non-null assertion per route.
 */
export function sessionOf(request: FastifyRequest): ServerSession {
  if (!request.session) throw unauthenticated();
  return request.session;
}

export function hasPermission(session: ServerSession, permission: Permission): boolean {
  return session.permissions.has(permission);
}

/** Authorization (RBAC): the frontend hides controls, but this is the real gate. */
export function requirePermission(...permissions: Permission[]): preHandlerAsyncHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = request.session;
    // Fail closed: a route registered without `requireSession` must still not be open.
    if (!session) return sendProblem(request, reply, unauthenticatedProblem());
    const missing = permissions.filter((permission) => !hasPermission(session, permission));
    if (missing.length > 0) {
      request.log.warn({ missing, user: session.persona.user.id }, 'permission denied');
      return sendProblem(request, reply, {
        type: ProblemType.Forbidden,
        title: 'Forbidden',
        status: 403,
        detail: `Missing permission: ${missing.join(', ')}`,
      });
    }
  };
}

/** Data entitlements (ABAC): may this user see this portfolio at all? */
export function canAccessPortfolio(session: ServerSession, portfolioId: string): boolean {
  return isPortfolioEntitled(session.persona.entitlements, portfolioId);
}

export function assertPortfolioAccess(session: ServerSession, portfolioId: string): void {
  if (!canAccessPortfolio(session, portfolioId))
    throw forbidden(`You are not entitled to portfolio ${portfolioId}.`);
}

export function actor(session: ServerSession): PersonRef {
  return { id: session.persona.user.id, name: session.persona.user.name };
}
