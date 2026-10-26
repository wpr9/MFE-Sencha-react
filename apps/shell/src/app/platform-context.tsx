import {
  describeError,
  type HostApi,
  type IntentRequest,
  type MeridianIntent,
  type MeridianIntentMap,
} from '@meridian/contracts';
import type { HostState, NotificationsSnapshot, Platform, SessionState } from '@meridian/platform';
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useStore } from 'zustand';

const PlatformContext = createContext<Platform | null>(null);

/** Makes the platform available to the shell's React tree (remotes get a scoped Host API instead). */
export function PlatformProvider({
  platform,
  children,
}: {
  readonly platform: Platform;
  readonly children: ReactNode;
}) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>;
}

/** The whole platform: shell-only, never handed to a remote. */
export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  if (!platform) throw new Error('usePlatform() requires <PlatformProvider>');
  return platform;
}

/** The shell's own scoped Host API (same surface every remote gets). */
export function useShellHost(): HostApi {
  const platform = usePlatform();
  return useMemo(() => platform.hostFor({ name: 'shell', module: 'shell' }), [platform]);
}

/** Cross-cutting UI state with its setters (theme, density, portfolio context). */
export function useHostStore<T>(selector: (state: HostState) => T): T {
  return useStore(usePlatform().store, selector);
}

/** Session phase and countdown; the manager keeps the state object stable between changes. */
export function useSessionState(): SessionState {
  const { session } = usePlatform();
  return useSyncExternalStore(session.subscribe, session.getState);
}

/** Toasts and the notification inbox. */
export function useNotificationCenter(): NotificationsSnapshot {
  const { notifications } = usePlatform();
  return useSyncExternalStore(notifications.subscribe, notifications.getSnapshot);
}

/**
 * Dispatches intents on the shell's behalf and surfaces a refusal (missing
 * permission, no handler) as a toast. Stable for the platform's lifetime, so
 * it is safe in memo dependencies.
 */
export function useShellIntents() {
  const platform = usePlatform();
  return useMemo(() => {
    const report = (error: unknown) =>
      platform.notifications
        .forSource('shell')
        .toast({ severity: 'error', message: describeError(error) });
    return {
      dispatch: <K extends MeridianIntent>(intent: K, payload: MeridianIntentMap[K]) =>
        void platform.intents.dispatch(intent, payload, 'shell').catch(report),
      /** For stored `{ intent, payload }` pairs (notification actions, menu items). */
      dispatchRequest: (request: IntentRequest) =>
        void platform.intents.dispatchRequest(request, 'shell').catch(report),
    };
  }, [platform]);
}
