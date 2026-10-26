import {
  CSRF_HEADER,
  PROBLEM_CONTENT_TYPE,
  ProblemDetailsSchema,
  type HttpClient,
  type HttpRequestOptions,
  type ProblemDetails,
  type QueryValue,
  type TelemetryApi,
} from '@meridian/contracts';
import { createTraceContext } from './ids';

/** HTTP error carrying the RFC 9457 problem document returned by the BFF. */
export class HttpError extends Error {
  override readonly name = 'HttpError';
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails,
    readonly traceId: string,
  ) {
    super(problem.detail ?? problem.title);
  }
}

export class NetworkError extends Error {
  override readonly name = 'NetworkError';
}

export class TimeoutError extends Error {
  override readonly name = 'TimeoutError';
}

/** The response did not match the expected schema - the API contract drifted. */
export class ContractError extends Error {
  override readonly name = 'ContractError';
  constructor(
    readonly path: string,
    override readonly cause: unknown,
  ) {
    super(`Response from ${path} does not match the expected contract`);
  }
}

export interface HttpClientOptions {
  readonly baseUrl: string;
  /** Logical caller (`shell` or a remote name), sent as `x-meridian-client`. */
  readonly clientName: string;
  readonly getCsrfToken: () => string | undefined;
  readonly onUnauthorized: () => void;
  readonly telemetry?: TelemetryApi;
  readonly defaultTimeoutMs?: number;
  readonly fetch?: typeof fetch;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Readonly<Record<string, QueryValue>>,
): string {
  const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

async function readProblem(response: Response): Promise<ProblemDetails> {
  const fallback: ProblemDetails = {
    type: 'about:blank',
    title: response.statusText || 'Request failed',
    status: response.status,
  };
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes(PROBLEM_CONTENT_TYPE) && !contentType.includes('application/json'))
    return fallback;
  try {
    const parsed = ProblemDetailsSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Fetch wrapper used by every remote via `host.http`. Centralises the
 * cross-cutting concerns that must never be re-implemented per team:
 * CSRF, W3C trace propagation, caller attribution, timeouts, uniform
 * problem+json errors, 401 handling and optional response validation.
 */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  const {
    baseUrl,
    clientName,
    getCsrfToken,
    onUnauthorized,
    telemetry,
    defaultTimeoutMs = 15_000,
  } = options;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function request<T>(
    method: string,
    path: string,
    body: unknown,
    requestOptions: HttpRequestOptions<T> = {},
  ): Promise<T> {
    const trace = createTraceContext();
    const headers: Record<string, string> = {
      accept: 'application/json',
      traceparent: trace.traceparent,
      'x-meridian-client': clientName,
      ...requestOptions.headers,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (!isSafeMethod(method)) {
      const token = getCsrfToken();
      if (token) headers[CSRF_HEADER] = token;
    }

    const timeout = AbortSignal.timeout(requestOptions.timeoutMs ?? defaultTimeoutMs);
    const signal = requestOptions.signal
      ? combineSignals([requestOptions.signal, timeout])
      : timeout;
    const url = buildUrl(baseUrl, path, requestOptions.query);
    const startedAt = performance.now();

    let response: Response;
    try {
      response = await doFetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
        signal,
      });
    } catch (error) {
      if (timeout.aborted && !requestOptions.signal?.aborted) {
        throw new TimeoutError(`${method} ${path} timed out`);
      }
      if (requestOptions.signal?.aborted) throw error;
      telemetry?.error(error, { kind: 'network', method, path });
      throw new NetworkError(`${method} ${path} failed: network unavailable`);
    }

    telemetry?.track('http.request', {
      method,
      path,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      traceId: trace.traceId,
    });

    if (!response.ok) {
      const problem = await readProblem(response);
      if (response.status === 401) onUnauthorized();
      throw new HttpError(response.status, problem, problem.traceId ?? trace.traceId);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0')
      return undefined as T;
    const data: unknown = await response.json();
    if (!requestOptions.parser) return data as T;
    try {
      return requestOptions.parser.parse(data);
    } catch (error) {
      telemetry?.error(error, { kind: 'contract', method, path });
      throw new ContractError(path, error);
    }
  }

  return Object.freeze({
    get: (path, opts) => request('GET', path, undefined, opts),
    post: (path, body, opts) => request('POST', path, body, opts),
    put: (path, body, opts) => request('PUT', path, body, opts),
    patch: (path, body, opts) => request('PATCH', path, body, opts),
    delete: (path, opts) => request('DELETE', path, undefined, opts),
  } satisfies HttpClient);
}
