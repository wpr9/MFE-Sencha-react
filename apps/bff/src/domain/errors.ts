import { ProblemType } from '@meridian/contracts';

/** Domain failures, mapped 1:1 to RFC 9457 problem documents by the error handler. */
export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    readonly title: string,
    detail: string,
    readonly extensions: Record<string, unknown> = {},
  ) {
    super(detail);
  }
}

/** The session cookie is missing, unknown or expired; the client re-authenticates. */
export const unauthenticated = () =>
  new DomainError(
    401,
    ProblemType.Unauthenticated,
    'Authentication required',
    'Your session has expired. Sign in again to continue.',
  );
export const notFound = (what: string) =>
  new DomainError(404, ProblemType.NotFound, 'Not found', `${what} was not found.`);
export const forbidden = (detail: string) =>
  new DomainError(403, ProblemType.Forbidden, 'Forbidden', detail);
export const conflict = (detail: string) =>
  new DomainError(409, ProblemType.Conflict, 'Conflict', detail);
export const validation = (detail: string, errors: { path: string; message: string }[] = []) =>
  new DomainError(422, ProblemType.Validation, 'Validation failed', detail, { errors });
