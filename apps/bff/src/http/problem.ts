import { PROBLEM_CONTENT_TYPE, ProblemType } from '@meridian/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { STATUS_CODES } from 'node:http';
import { ZodError } from 'zod';
import { DomainError } from '../domain/errors';

interface ProblemInput {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly [extension: string]: unknown;
}

/** Sends an RFC 9457 problem document, stamped with the request path and trace id. */
export function sendProblem(request: FastifyRequest, reply: FastifyReply, problem: ProblemInput) {
  return reply
    .code(problem.status)
    .type(PROBLEM_CONTENT_TYPE)
    .send({ ...problem, instance: request.url.split('?')[0], traceId: request.traceId });
}

/** Field-level issues in the problem document's `errors` extension. */
export function zodErrors(error: ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/** Every failure leaves the BFF as RFC 9457 problem+json - no stack traces, ever. */
export function registerErrorHandling(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) =>
    sendProblem(request, reply, {
      type: ProblemType.NotFound,
      title: 'Not found',
      status: 404,
      detail: `No route for ${request.method} ${request.url.split('?')[0]}`,
    }),
  );

  app.setErrorHandler((error: FastifyError | DomainError | ZodError, request, reply) => {
    if (error instanceof DomainError) {
      return sendProblem(request, reply, {
        type: error.type,
        title: error.title,
        status: error.status,
        detail: error.message,
        ...error.extensions,
      });
    }
    if (error instanceof ZodError) {
      return sendProblem(request, reply, {
        type: ProblemType.Validation,
        title: 'Validation failed',
        status: 422,
        detail: 'The request is invalid.',
        errors: zodErrors(error),
      });
    }
    if (error.statusCode === 429) {
      return sendProblem(request, reply, {
        type: ProblemType.RateLimited,
        title: 'Too many requests',
        status: 429,
        detail: error.message,
      });
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return sendProblem(request, reply, {
        type: 'about:blank',
        title: STATUS_CODES[error.statusCode] ?? 'Request rejected',
        status: error.statusCode,
        detail: error.message,
      });
    }
    request.log.error({ err: error }, 'unhandled error');
    return sendProblem(request, reply, {
      type: ProblemType.Internal,
      title: 'Internal error',
      status: 500,
      detail: 'An unexpected error occurred. Quote the trace id when contacting support.',
    });
  });
}
