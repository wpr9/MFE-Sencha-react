import type {
  Density,
  HostStateApi,
  HostStateSnapshot,
  ThemeMode,
  ThemePreference,
} from '@meridian/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { notifyAll } from './listeners';

export interface HostState extends HostStateSnapshot {
  setThemePreference(preference: ThemePreference): void;
  setDensity(density: Density): void;
  setActivePortfolio(portfolioId: string | null): void;
  setOnline(online: boolean): void;
}

export type HostStore = StoreApi<HostState>;

interface PersistedPreferences {
  readonly themePreference: ThemePreference;
  readonly density: Density;
  readonly activePortfolioId: string | null;
}

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

function readPreferences(
  storage: HostStoreOptions['storage'],
  key: string,
): Partial<PersistedPreferences> {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<PersistedPreferences>) : {};
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

  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      const { themePreference: preference } = store.getState();
      if (preference === 'system') store.setState({ theme: resolveTheme(preference, prefersDark) });
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => store.getState().setOnline(true));
    window.addEventListener('offline', () => store.getState().setOnline(false));
  }
  return store;
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

/**
 * Read-only facade for remotes. Snapshots are memoised so that consumers
 * using `useSyncExternalStore` get referentially stable values.
 */
export function toHostStateApi(store: HostStore): HostStateApi {
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
    setActivePortfolio: (portfolioId) => store.getState().setActivePortfolio(portfolioId),
  } satisfies HostStateApi);
}
