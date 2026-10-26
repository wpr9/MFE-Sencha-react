import type { FeatureFlagsApi } from '@meridian/contracts';

export interface FeatureFlags extends FeatureFlagsApi {
  /** Local override for QA/demo; `null` removes it. Disabled in production. */
  setOverride(flag: string, value: boolean | null): void;
  getOverrides(): Readonly<Record<string, boolean>>;
  subscribe(listener: () => void): () => void;
}

const STORAGE_KEY = 'meridian.flag-overrides.v1';

function readOverrides(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/**
 * Server-evaluated flags (delivered with the session) with optional local
 * overrides, so QA can exercise a flag without a backend change. Overrides are
 * ignored entirely when `allowOverrides` is false (production).
 */
export function createFeatureFlags(
  serverFlags: Readonly<Record<string, boolean>>,
  allowOverrides: boolean,
): FeatureFlags {
  let overrides = allowOverrides ? readOverrides() : {};
  let effective = { ...serverFlags, ...overrides };
  const listeners = new Set<() => void>();

  return {
    isEnabled: (flag) => effective[flag] === true,
    getAll: () => effective,
    getOverrides: () => overrides,
    setOverride(flag, value) {
      if (!allowOverrides) return;
      const next = { ...overrides };
      if (value === null) delete next[flag];
      else next[flag] = value;
      overrides = next;
      effective = { ...serverFlags, ...overrides };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
      } catch {
        // best-effort
      }
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
