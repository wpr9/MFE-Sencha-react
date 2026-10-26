import { PortfolioSummarySchema, apiPaths, type PortfolioSummary } from '@meridian/contracts';
import { useEffect, useState } from 'react';
import { useShellHost } from '../platform-context';

interface Resource<T> {
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
}

/** Shell chrome tolerates a slightly stale list; remotes own the live one. */
const CACHE_TTL_MS = 30_000;

let cache: { at: number; promise: Promise<PortfolioSummary[]> } | null = null;

/** Entitled portfolios for shell chrome (context picker, palette), cached briefly. */
export function usePortfolios(enabled = true): Resource<PortfolioSummary[]> {
  const host = useShellHost();
  const [state, setState] = useState<Omit<Resource<PortfolioSummary[]>, 'loading'>>({
    data: undefined,
    error: null,
  });
  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
      cache = {
        at: Date.now(),
        promise: host.http.get(apiPaths.portfolios(), { parser: PortfolioSummarySchema.array() }),
      };
      cache.promise.catch(() => {
        cache = null;
      });
    }
    cache.promise.then(
      (data) => active && setState({ data, error: null }),
      (error: unknown) => active && setState({ data: undefined, error }),
    );
    return () => {
      active = false;
    };
  }, [host, enabled]);
  // Derived, so a hook enabled later (the picker opening) shows its skeleton too.
  return { ...state, loading: enabled && state.data === undefined && state.error == null };
}
