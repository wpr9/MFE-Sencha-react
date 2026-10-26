import type { FeatureFlagsApi } from '@meridian/contracts';
import { z } from 'zod';

export interface FeatureFlags extends FeatureFlagsApi {
  /** Local override for QA/demo; `null` removes it. Disabled in production. */
  setOverride(flag: string, value: boolean | null): void;
  getOverrides(): Readonly<Record<string, boolean>>;
  /** Server flags travel with the session document; a renewal may change them. */
  setServerFlags(flags: Readonly<Record<string, boolean>>): void;
  subscribe(listener: () => void): () => void;
}

const STORAGE_KEY = 'meridian.flag-overrides.v1';
/** Anything else found in storage (an older build, a hand edit) is ignored, not trusted. */
const OverridesSchema = z.record(z.string(), z.boolean());

function readOverrides(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = OverridesSchema.safeParse(raw ? JSON.parse(raw) : {});
    return parsed.success ? parsed.data : {};
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
  let server = serverFlags;
  let overrides: Readonly<Record<string, boolean>> = Object.freeze(
    allowOverrides ? readOverrides() : {},
  );
  // Frozen: remotes read flags; they never flip them for everyone else.
  let effective: Readonly<Record<string, boolean>> = Object.freeze({ ...server, ...overrides });
  const listeners = new Set<() => void>();
  const recompute = () => {
    effective = Object.freeze({ ...server, ...overrides });
    for (const listener of [...listeners]) listener();
  };

  return {
    isEnabled: (flag) => effective[flag] === true,
    getAll: () => effective,
    getOverrides: () => overrides,
    setOverride(flag, value) {
      if (!allowOverrides) return;
      const next = { ...overrides };
      if (value === null) delete next[flag];
      else next[flag] = value;
      overrides = Object.freeze(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
      } catch {
        // best-effort
      }
      recompute();
    },
    setServerFlags(flags) {
      server = flags;
      recompute();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
