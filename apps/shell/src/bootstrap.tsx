import '@fontsource-variable/google-sans';
import '@fontsource-variable/roboto';
import '@fontsource-variable/roboto-mono';
import { authPaths, describeError } from '@meridian/contracts';
import { installTokenStylesheet } from '@meridian/design-tokens';
import { buildLoginUrl, createPlatform, fetchSession, reportWebVitals } from '@meridian/platform';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { startMessageFlow } from './app/message-flow';
import { getRegistryProblems, loadRemoteRegistry } from './app/remotes';
import { createAppRouter } from './app/router';
import { createRouterNavigation, registerIntents, wireServerNotifications } from './app/wiring';

/**
 * Boot sequence:
 *  1. Session + remote registry in parallel (one round trip on the critical path).
 *  2. No session -> the BFF's sign-in flow, preserving the deep link.
 *  3. Platform services, intent handlers and notifications.
 *  4. Render; remotes load lazily per route.
 */
async function start() {
  installTokenStylesheet();
  const [session, registry] = await Promise.all([fetchSession(), loadRemoteRegistry()]);
  if (!session) {
    window.location.replace(buildLoginUrl());
    return;
  }

  const router = createAppRouter();
  const navigation = createRouterNavigation(router);
  const platform = createPlatform({
    session,
    env: {
      // The same artefact is promoted between environments: the registry names the
      // environment; the build only knows whether it is a dev build.
      name: registry.environment ?? (import.meta.env.DEV ? 'local' : 'production'),
      apiBaseUrl: '/api',
      shellVersion: __SHELL_VERSION__,
    },
    navigation,
    appName: 'shell',
    debug: import.meta.env.DEV,
    onSignedOut: () => window.location.assign(`${authPaths.login}?signedOut=1`),
  });
  for (const problem of getRegistryProblems()) {
    platform.telemetry
      .forSource('shell')
      .error(new Error(problem.error), { kind: 'remote-registry', remote: problem.remote });
  }
  startMessageFlow(platform);
  registerIntents(platform);
  wireServerNotifications(platform);
  void platform.start();
  void reportWebVitals(platform.telemetry);

  const container = document.getElementById('root');
  if (!container) throw new Error('#root not found');
  createRoot(container, {
    onUncaughtError: (error) =>
      platform.telemetry.forSource('shell').error(error, { kind: 'react-uncaught' }),
  }).render(
    <StrictMode>
      <App platform={platform} router={router} />
    </StrictMode>,
  );
}

start().catch((error: unknown) => {
  console.error(error);
  const container = document.getElementById('root');
  if (container) {
    container.innerHTML = '';
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText =
      'max-width:480px;margin:20vh auto;padding:24px;font:14px/20px system-ui,sans-serif;color:#1f1f1f;text-align:center';
    box.innerHTML =
      '<h1 style="font:400 24px/32px system-ui,sans-serif;margin:0 0 8px">Meridian is unavailable</h1>';
    const detail = document.createElement('p');
    detail.textContent = `The workspace could not start (${describeError(error)}). Retry in a moment.`;
    const retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.style.cssText =
      'margin-top:12px;padding:8px 20px;border-radius:20px;border:1px solid #747775;background:transparent;color:#0b57d0;font:500 14px system-ui;cursor:pointer';
    retry.onclick = () => window.location.reload();
    box.append(detail, retry);
    container.append(box);
  }
});
