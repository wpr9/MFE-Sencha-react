import { randomBytes, timingSafeEqual } from 'node:crypto';

/** URL-safe random secret; 32 bytes (256 bits) for session ids, fewer for short-lived tokens. */
export function token(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Constant-time string comparison for secrets (CSRF and login-state tokens). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Login-CSRF state token bound to one sign-in form. */
export function newLoginState(): string {
  return token(18);
}
