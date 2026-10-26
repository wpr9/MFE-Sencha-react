import type { HostLocation, NavigationApi, RemoteModule, RemoteProps } from '@meridian/contracts';
import { installTokenStylesheet } from '@meridian/design-tokens';
import { buildLoginUrl, createPlatform, fetchSession } from '@meridian/platform';

export interface DevHostOptions {
  /** Remote name used for attribution, e.g. `blotter`. */
  readonly remoteName: string;
  readonly title: string;
  readonly basePath: string;
  readonly load: () => Promise<{ default: RemoteModule }>;
  readonly props?: RemoteProps;
}

function createHistoryNavigation(): NavigationApi {
  const listeners = new Set<(location: HostLocation) => void>();
  const current = (): HostLocation => ({
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  });
  const notify = () => {
    const snapshot = current();
    for (const listener of [...listeners]) listener(snapshot);
  };
  window.addEventListener('popstate', notify);
  return {
    getLocation: current,
    navigate(to, options) {
      if (options?.replace) history.replaceState(null, '', to);
      else history.pushState(null, '', to);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const STYLES = `
.mrd-devhost { position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--mrd-color-background); color: var(--mrd-color-on-surface); font: var(--mrd-type-body-medium); }
.mrd-devhost__bar { height: 56px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 16px; }
.mrd-devhost__title { font: var(--mrd-type-title-medium); }
.mrd-devhost__badge { font: var(--mrd-type-label-medium); padding: 2px 8px; border-radius: 8px; background: var(--mrd-status-warning-bg); color: var(--mrd-status-warning-fg); }
.mrd-devhost__spacer { flex: 1; }
.mrd-devhost__user { color: var(--mrd-color-on-surface-variant); }
.mrd-devhost button { font: var(--mrd-type-label-large); color: var(--mrd-color-primary); background: transparent; border: 1px solid var(--mrd-color-outline-variant); border-radius: 20px; padding: 6px 14px; cursor: pointer; }
.mrd-devhost button:hover { background: var(--mrd-color-hover-overlay); }
.mrd-devhost__main { flex: 1; min-height: 0; margin: 0 16px 16px; background: var(--mrd-color-surface); border-radius: 16px; overflow: hidden; display: flex; }
.mrd-devhost__main > * { flex: 1; min-width: 0; min-height: 0; }
.mrd-devhost__log { position: fixed; right: 16px; bottom: 16px; max-width: 420px; display: flex; flex-direction: column; gap: 8px; z-index: 2000; }
.mrd-devhost__toast { background: var(--mrd-color-surface-inverse); color: var(--mrd-color-on-surface-inverse); border-radius: 8px; padding: 12px 16px; box-shadow: var(--mrd-elevation-2); font: var(--mrd-type-body-medium); }
`;

/**
 * Standalone harness: runs one remote against the real BFF and the same
 * platform services the shell uses, without the shell. Intents are logged
 * as toasts instead of being routed to other remotes.
 */
export async function startDevHost(options: DevHostOptions): Promise<void> {
  installTokenStylesheet();
  const session = await fetchSession();
  if (!session) {
    location.assign(buildLoginUrl());
    return;
  }

  const navigation = createHistoryNavigation();
  const platform = createPlatform({
    session,
    env: { name: 'local', apiBaseUrl: '/api', shellVersion: 'dev-host' },
    navigation,
    appName: 'dev-host',
    debug: true,
    onSignedOut: () => location.assign(buildLoginUrl()),
  });
  void platform.start();

  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.append(style);

  const root = document.createElement('div');
  root.className = 'mrd-devhost';
  root.innerHTML = `
    <header class="mrd-devhost__bar">
      <span class="mrd-devhost__title"></span>
      <span class="mrd-devhost__badge">Standalone dev host</span>
      <span class="mrd-devhost__spacer"></span>
      <span class="mrd-devhost__user"></span>
      <button type="button" data-action="theme">Toggle theme</button>
      <button type="button" data-action="signout">Sign out</button>
    </header>
    <main class="mrd-devhost__main"><div data-slot="remote"></div></main>
    <div class="mrd-devhost__log" aria-live="polite"></div>`;
  (root.querySelector('.mrd-devhost__title') as HTMLElement).textContent = options.title;
  (root.querySelector('.mrd-devhost__user') as HTMLElement).textContent =
    `${session.user.name} · ${session.roles.join(', ')}`;
  document.body.append(root);

  const log = root.querySelector('.mrd-devhost__log') as HTMLElement;
  const toast = (message: string) => {
    const item = document.createElement('div');
    item.className = 'mrd-devhost__toast';
    item.textContent = message;
    log.append(item);
    setTimeout(() => item.remove(), 4000);
  };
  platform.notifications.subscribe(() => {
    const latest = platform.notifications.getSnapshot().toasts.at(-1);
    if (latest) {
      toast(latest.message);
      platform.notifications.dismissToast(latest.id);
    }
  });
  for (const intent of [
    'trade.ticket.open',
    'order.open',
    'portfolio.open',
    'compliance.alert.open',
    'security.open',
  ] as const) {
    platform.intents.register(intent, (payload, context) =>
      toast(`Intent ${intent} from ${context.source}: ${JSON.stringify(payload)}`),
    );
  }

  const applyTheme = () => {
    document.documentElement.dataset['theme'] = platform.store.getState().theme;
  };
  applyTheme();
  platform.store.subscribe(applyTheme);
  root.querySelector('[data-action="theme"]')?.addEventListener('click', () => {
    const { theme, setThemePreference } = platform.store.getState();
    setThemePreference(theme === 'dark' ? 'light' : 'dark');
  });
  root
    .querySelector('[data-action="signout"]')
    ?.addEventListener('click', () => void platform.session.signOut());

  const module = await options.load();
  const slot = root.querySelector('[data-slot="remote"]') as HTMLElement;
  await module.default.mount(slot, {
    host: platform.hostFor({ name: options.remoteName, module: './App' }),
    basePath: options.basePath,
    props: options.props ?? {},
  });
}
