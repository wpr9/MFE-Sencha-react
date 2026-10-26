import { z } from 'zod';

/**
 * RFC 9457 "Problem Details for HTTP APIs" - the only error shape the BFF
 * returns, so every client can render errors uniformly.
 */
export const ProblemDetailsSchema = z.looseObject({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  traceId: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** Stable problem type URIs; clients branch on these, never on `title` text. */
export const ProblemType = {
  Validation: 'https://meridian.example/problems/validation',
  Unauthenticated: 'https://meridian.example/problems/unauthenticated',
  Forbidden: 'https://meridian.example/problems/forbidden',
  NotFound: 'https://meridian.example/problems/not-found',
  Conflict: 'https://meridian.example/problems/conflict',
  ComplianceBlocked: 'https://meridian.example/problems/compliance-blocked',
  CsrfRejected: 'https://meridian.example/problems/csrf-rejected',
  RateLimited: 'https://meridian.example/problems/rate-limited',
  Internal: 'https://meridian.example/problems/internal',
} as const;

/**
 * The error `host.http` throws for a non-2xx response (the platform's
 * `HttpError`). Remotes cannot import the platform, so they recognise it
 * structurally: by name and by the problem document it carries.
 */
export interface HttpErrorLike extends Error {
  readonly status: number;
  readonly problem: ProblemDetails;
  readonly traceId: string;
}

export function isHttpError(error: unknown): error is HttpErrorLike {
  return (
    error instanceof Error &&
    error.name === 'HttpError' &&
    typeof (error as HttpErrorLike).status === 'number'
  );
}

/** One user-facing sentence for any error raised by `host.http` (or anything else). */
export function describeError(error: unknown): string {
  if (isHttpError(error)) {
    if (error.status === 403)
      return error.problem.detail ?? 'You do not have permission to perform this action.';
    return error.problem.detail ?? error.problem.title;
  }
  if (error instanceof Error) {
    switch (error.name) {
      case 'TimeoutError':
        return 'The request took too long. Please try again.';
      case 'NetworkError':
        return 'Network unavailable. Check your connection and try again.';
      case 'ContractError':
        return 'Unexpected response from the server.';
      default:
        return error.message;
    }
  }
  return 'Something went wrong.';
}
