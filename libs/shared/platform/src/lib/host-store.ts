import type {
  Density,
  HostStateApi,
  HostStateSnapshot,
  ThemeMode,
  ThemePreference,
} from '@meridian/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { z } from 'zod';
import { notifyAll } from './listeners';

export interface HostState extends HostStateSnapshot {
  setThemePreference(preference: ThemePreference): void;
  setDensity(density: Density): void;
  setActivePortfolio(portfolioId: string | null): void;
  setOnline(online: boolean): void;
}

export interface HostStore extends StoreApi<HostState> {
  /** Removes the window and media-query listeners (dev host, tests). */
  dispose(): void;
}

/**
 * What one user's preferences look like in storage. Validated on read: a value
 * from an older build or a hand edit must fall back to defaults, never reach
 * the theme (an unknown mode would throw inside MUI on every load).
 */
const PersistedPreferencesSchema = z.object({
  themePreference: z.enum(['light', 'dark', 'system'] satisfies ThemePreference[]).optional(),
  density: z.enum(['comfortable', 'compact'] satisfies Density[]).optional(),
  activePortfolioId: z.string().nullable().optional(),
});
type PersistedPreferences = z.infer<typeof PersistedPreferencesSchema>;

export interface HostStoreOptions {
  /** Namespaces persisted preferences, e.g. per user id. */
  readonly storageKey: string;
  readonly storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  readonly prefersDark?: () => boolean;
  readonly locale?: string;
  readonly timeZone?: string;
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // Storage can throw in private mode or when blocked.
  }
}

function readPreferences(storage: HostStoreOptions['storage'], key: string): PersistedPreferences {
  try {
    const raw = storage?.getItem(key);
    const parsed = PersistedPreferencesSchema.safeParse(raw ? JSON.parse(raw) : {});
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

const resolveTheme = (preference: ThemePreference, prefersDark: () => boolean): ThemeMode =>
  preference === 'system' ? (prefersDark() ? 'dark' : 'light') : preference;

/**
 * Cross-cutting UI state owned by the shell (theme, density, portfolio
 * context, connectivity). Remotes receive a read-only facade
 * (see `toHostStateApi`), so state ownership stays unambiguous.
 */
export function createHostStore(options: HostStoreOptions): HostStore {
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  const prefersDark =
    options.prefersDark ??
    (() => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  const persisted = readPreferences(storage, options.storageKey);
  const themePreference = persisted.themePreference ?? 'system';

  const store = createStore<HostState>()((set, get) => ({
    theme: resolveTheme(themePreference, prefersDark),
    themePreference,
    density: persisted.density ?? 'comfortable',
    locale:
      options.locale ??
      (typeof navigator === 'undefined' ? 'en-US' : navigator.language || 'en-US'),
    timeZone: options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    activePortfolioId: persisted.activePortfolioId ?? null,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    setThemePreference: (preference) =>
      set({ themePreference: preference, theme: resolveTheme(preference, prefersDark) }),
    setDensity: (density) => set({ density }),
    setActivePortfolio: (portfolioId) => {
      if (get().activePortfolioId !== portfolioId) set({ activePortfolioId: portfolioId });
    },
    setOnline: (online) => set({ online }),
  }));

  store.subscribe((state, previous) => {
    if (
      state.themePreference === previous.themePreference &&
      state.density === previous.density &&
      state.activePortfolioId === previous.activePortfolioId
    ) {
      return;
    }
    try {
      const preferences: PersistedPreferences = {
        themePreference: state.themePreference,
        density: state.density,
        activePortfolioId: state.activePortfolioId,
      };
      storage?.setItem(options.storageKey, JSON.stringify(preferences));
    } catch {
      // Persisting preferences is best-effort.
    }
  });

  const cleanups: (() => void)[] = [];
  if (typeof matchMedia === 'function') {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const { themePreference: preference } = store.getState();
      if (preference === 'system') store.setState({ theme: resolveTheme(preference, prefersDark) });
    };
    media.addEventListener?.('change', onChange);
    cleanups.push(() => media.removeEventListener?.('change', onChange));
  }
  if (typeof window !== 'undefined') {
    const online = () => store.getState().setOnline(true);
    const offline = () => store.getState().setOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    cleanups.push(() => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    });
  }
  return Object.assign(store, {
    dispose() {
      for (const cleanup of cleanups) cleanup();
    },
  });
}

const SNAPSHOT_KEYS = [
  'theme',
  'themePreference',
  'density',
  'locale',
  'timeZone',
  'activePortfolioId',
  'online',
] as const;

function toSnapshot(state: HostState): HostStateSnapshot {
  return {
    theme: state.theme,
    themePreference: state.themePreference,
    density: state.density,
    locale: state.locale,
    timeZone: state.timeZone,
    activePortfolioId: state.activePortfolioId,
    online: state.online,
  };
}

export interface HostStateApiOptions {
  /** Entitlement check behind `setActivePortfolio`; the default allows every id (dev host, tests). */
  readonly isEntitled?: (portfolioId: string) => boolean;
}

/**
 * Read-only facade for remotes. Snapshots are memoised so that consumers
 * using `useSyncExternalStore` get referentially stable values.
 */
export function toHostStateApi(store: HostStore, options: HostStateApiOptions = {}): HostStateApi {
  const { isEntitled = () => true } = options;
  let lastState = store.getState();
  let lastSnapshot = Object.freeze(toSnapshot(lastState));
  const snapshotOf = (state: HostState) => {
    if (state !== lastState) {
      const changed = SNAPSHOT_KEYS.some((key) => state[key] !== lastState[key]);
      lastState = state;
      if (changed) lastSnapshot = Object.freeze(toSnapshot(state));
    }
    return lastSnapshot;
  };
  return Object.freeze({
    getSnapshot: () => snapshotOf(store.getState()),
    subscribe: (listener) => {
      let previous = snapshotOf(store.getState());
      return store.subscribe((state) => {
        const next = snapshotOf(state);
        if (next !== previous) {
          const prior = previous;
          previous = next;
          // zustand calls listeners in one loop: isolate each remote's listener.
          notifyAll([listener], [next, prior]);
        }
      });
    },
    setActivePortfolio: (portfolioId) => {
      // Every remote follows the workspace context, so only portfolios the user is
      // entitled to may become it. Anything else is ignored rather than thrown: it is a
      // stale deep link or a buggy remote, not something the user can act on.
      if (portfolioId !== null && !isEntitled(portfolioId)) return;
      store.getState().setActivePortfolio(portfolioId);
    },
  } satisfies HostStateApi);
}
