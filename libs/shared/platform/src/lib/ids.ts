/** Random identifier. The app only runs in secure contexts, where `crypto.randomUUID` exists. */
export function randomId(): string {
  return crypto.randomUUID();
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  /** W3C Trace Context `traceparent` header value. */
  readonly traceparent: string;
}

/** Starts a new sampled W3C trace (https://www.w3.org/TR/trace-context/). */
export function createTraceContext(): TraceContext {
  const traceId = randomHex(16);
  const spanId = randomHex(8);
  return { traceId, spanId, traceparent: `00-${traceId}-${spanId}-01` };
}
