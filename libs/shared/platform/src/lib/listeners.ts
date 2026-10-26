/**
 * Invokes every listener even when some throw. Listeners usually belong to
 * remotes, and one faulty remote must not stop the platform from notifying the
 * others - or from finishing what it was doing (reconnecting, signing out).
 */
export function notifyAll<A extends unknown[]>(
  listeners: Iterable<(...args: A) => void>,
  args: A,
  onError: (error: unknown) => void = reportListenerError,
): void {
  for (const listener of [...listeners]) {
    try {
      listener(...args);
    } catch (error) {
      onError(error);
    }
  }
}

/** Surfaces an error like an uncaught one (console, `error` handlers) without throwing. */
export function reportListenerError(error: unknown): void {
  if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
  else console.error(error);
}
