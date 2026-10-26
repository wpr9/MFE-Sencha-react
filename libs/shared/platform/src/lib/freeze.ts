/**
 * Freezes plain data recursively: objects and arrays, nested ones included.
 * Class instances, Maps and Sets are left alone (the platform never shares
 * them across remotes). Used so that what the Host API hands out - session,
 * environment, quotes, event payloads - cannot be mutated by one remote and
 * observed by another.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
