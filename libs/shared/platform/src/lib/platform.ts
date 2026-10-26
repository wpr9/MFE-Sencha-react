import {
  HOST_CONTRACT_VERSION,
  QuoteSchema,
  apiPaths,
  isPortfolioEntitled,
  type AuthApi,
  type FeatureFlagsApi,
  type HostApi,
  type HostEnvironment,
  type HostStateApi,
  type NavigationApi,
  type RemoteIdentity,
  type Session,
  type StreamEvent,
} from '@meridian/contracts';
import { createEventBus, type EventBusController } from './event-bus';
import { createFeatureFlags, type FeatureFlags } from './flags';
import { createHostStore, toHostStateApi, type HostStore } from './host-store';
import { createHttpClient, isSafeMethod } from './http';
import { createTraceContext } from './ids';
import { createIntentRegistry, type IntentRegistry } from './intents';
import { createMarketDataService, type MarketDataService } from './market-data';
import { createNotificationCenter, type NotificationCenter } from './notifications';
import { createRealtimeConnection, type RealtimeConnection } from './realtime';
import { createSessionManager, type SessionManager } from './session';
import { createTelemetry, type Telemetry } from './telemetry';

export interface PlatformOptions {
  readonly session: Session;
  readonly env: HostEnvironment;
  readonly navigation: NavigationApi;
  /** Name used for the platform's own attribution (e.g. `shell`, `dev-host`). */
  readonly appName: string;
  readonly debug?: boolean;
  readonly onSignedOut?: () => void;
}

export interface Platform {
  readonly env: HostEnvironment;
  readonly session: SessionManager;
  readonly store: HostStore;
  readonly state: HostStateApi;
  readonly bus: EventBusController;
  readonly intents: IntentRegistry;
  readonly notifications: NotificationCenter;
  readonly telemetry: Telemetry;
  readonly flags: FeatureFlags;
  readonly marketData: MarketDataService;
  readonly realtime: RealtimeConnection;
  readonly navigation: NavigationApi;
  /** Issues the scoped, frozen Host API for one remote module. */
  hostFor(identity: RemoteIdentity): HostApi;
  start(): Promise<void>;
  dispose(): void;
}

/**
 * Composition root of the client platform. The shell (and the standalone dev
 * host) call this once; every remote then receives `hostFor(identity)`.
 */
export function createPlatform(options: PlatformOptions): Platform {
  const { env, navigation, appName, debug = false } = options;

  const telemetry = createTelemetry({
    endpoint: `${env.apiBaseUrl}${apiPaths.telemetry()}`,
    app: appName,
    version: env.shellVersion,
    debug,
  });
  const platformTelemetry = telemetry.forSource(appName);

  const session = createSessionManager({
    initialSession: options.session,
    onSignedOut: options.onSignedOut,
    onListenerError: (error) => platformTelemetry.error(error, { kind: 'session-listener' }),
  });
  const currentSession = () => session.getState().session;

  const store = createHostStore({
    storageKey: `meridian.preferences.v1.${options.session.user.id}`,
  });
  const state = toHostStateApi(store);
  const flags = createFeatureFlags(options.session.flags, env.name !== 'production');
  const flagsApi: FeatureFlagsApi = Object.freeze({
    isEnabled: flags.isEnabled,
    getAll: flags.getAll,
  });

  const bus = createEventBus({
    onHandlerError: (error, envelope) =>
      telemetry
        .forSource(envelope.source)
        .error(error, { kind: 'event-handler', topic: envelope.topic }),
  });
  const intents = createIntentRegistry({
    onDispatch: (intent, source) =>
      platformTelemetry.track('intent.dispatched', { intent, source }),
  });
  const notifications = createNotificationCenter();
  const marketData = createMarketDataService({
    onListenerError: (error) => platformTelemetry.error(error, { kind: 'market-data-listener' }),
  });

  const routeStreamEvent = (event: StreamEvent) => {
    switch (event.type) {
      case 'quotes':
        marketData.ingest(event.quotes);
        break;
      case 'order.created':
        bus.publish('server', 'order.created', { order: event.order });
        break;
      case 'order.updated':
        bus.publish('server', 'order.updated', {
          order: event.order,
          previousStatus: event.previousStatus,
        });
        break;
      case 'alert.raised':
        bus.publish('server', 'compliance.alert.raised', { alert: event.alert });
        break;
      case 'alert.updated':
        bus.publish('server', 'compliance.alert.updated', { alert: event.alert });
        break;
      case 'portfolio.changed':
        bus.publish('server', 'portfolio.changed', {
          portfolioId: event.portfolioId,
          reason: event.reason,
        });
        break;
      case 'session.ended':
        session.handleUnauthorized();
        break;
    }
  };

  const realtime = createRealtimeConnection({
    url: `${env.apiBaseUrl}${apiPaths.stream()}`,
    onEvent: routeStreamEvent,
    onInvalidEvent: (error) => platformTelemetry.error(error, { kind: 'stream-contract' }),
    onListenerError: (error) => platformTelemetry.error(error, { kind: 'stream-status-listener' }),
  });
  realtime.subscribeStatus((status) => marketData.setStatus(status));
  // A dead session must not keep reconnecting (401s), nor resume under a session
  // another tab signed in with: the stream ends with the session.
  const stopStreamOnSessionEnd = session.subscribe(({ phase }) => {
    if (phase === 'expired' || phase === 'signed-out') realtime.stop();
  });

  // Errors outside any boundary (async callbacks, listeners) still reach telemetry.
  const onWindowError = (event: ErrorEvent) =>
    platformTelemetry.error(event.error ?? event.message, { kind: 'uncaught' });
  const onUnhandledRejection = (event: PromiseRejectionEvent) =>
    platformTelemetry.error(event.reason, { kind: 'unhandled-rejection' });
  if (typeof window !== 'undefined') {
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
  }

  const authFor = (clientName: string): AuthApi =>
    Object.freeze({
      getSession: currentSession,
      getUser: () => currentSession().user,
      hasPermission: (permission) => currentSession().permissions.includes(permission),
      canAccessPortfolio: (portfolioId) =>
        isPortfolioEntitled(currentSession().entitlements.portfolios, portfolioId),
      getRequestHeaders(method) {
        const headers: Record<string, string> = {
          traceparent: createTraceContext().traceparent,
          'x-meridian-client': clientName,
        };
        if (!isSafeMethod(method)) headers['x-csrf-token'] = currentSession().csrfToken;
        return headers;
      },
      reportUnauthorized: () => session.handleUnauthorized(),
      signOut: () => session.signOut(),
      subscribe: (listener) => session.subscribe((sessionState) => listener(sessionState.session)),
    } satisfies AuthApi);

  const hosts = new Map<string, HostApi>();

  const hostFor = (identity: RemoteIdentity): HostApi => {
    const key = `${identity.name}/${identity.module}`;
    const cached = hosts.get(key);
    if (cached) return cached;
    const remoteTelemetry = telemetry.forSource(identity.name);
    const host: HostApi = Object.freeze({
      contractVersion: HOST_CONTRACT_VERSION,
      remote: Object.freeze({ ...identity }),
      env,
      auth: authFor(identity.name),
      http: createHttpClient({
        baseUrl: env.apiBaseUrl,
        clientName: identity.name,
        getCsrfToken: () => currentSession().csrfToken,
        onUnauthorized: () => session.handleUnauthorized(),
        telemetry: remoteTelemetry,
      }),
      events: bus.forSource(identity.name),
      intents: intents.forSource(identity.name),
      state,
      navigation,
      marketData: marketData.api,
      notifications: notifications.forSource(identity.name),
      flags: flagsApi,
      telemetry: remoteTelemetry,
    } satisfies HostApi);
    hosts.set(key, host);
    return host;
  };

  return {
    env,
    session,
    store,
    state,
    bus,
    intents,
    notifications,
    telemetry,
    flags,
    marketData,
    realtime,
    navigation,
    hostFor,
    async start() {
      realtime.start();
      try {
        const shellHttp = hostFor({ name: appName, module: 'platform' }).http;
        marketData.ingest(await shellHttp.get(apiPaths.quotes(), { parser: QuoteSchema.array() }));
      } catch (error) {
        platformTelemetry.error(error, { kind: 'quote-snapshot' });
      }
    },
    dispose() {
      stopStreamOnSessionEnd();
      realtime.stop();
      session.dispose();
      telemetry.dispose();
      if (typeof window !== 'undefined') {
        window.removeEventListener('error', onWindowError);
        window.removeEventListener('unhandledrejection', onUnhandledRejection);
      }
    },
  };
}
