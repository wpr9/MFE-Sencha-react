/**
 * Random UUID (v4). `crypto.randomUUID` exists only in secure contexts (https,
 * localhost); a demo served over plain http from a LAN address would otherwise
 * throw on the first event, so the same layout is built from `getRandomValues`.
 */
export function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
