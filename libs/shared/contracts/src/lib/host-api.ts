import type { FeatureFlag, Permission } from './authorization';
import type { Quote } from './domain';
import type {
  EventBus,
  IntentRequest,
  MeridianIntent,
  MeridianIntentMap,
  Unsubscribe,
} from './messaging';
import type { Session, SessionUser } from './session';

/**
 * The Host API: the *only* surface a remote may use to interact with the
 * platform. It is framework-agnostic (plain objects, callbacks and promises),
 * so the React remotes and the Sencha Ext JS remote consume it identically.
 *
 * Every remote receives its own scoped instance: events, HTTP calls and
 * telemetry it emits are attributed to it automatically.
 *
 * Versioning: additive changes bump the minor version of
 * HOST_CONTRACT_VERSION; anything else bumps the major. Remotes declare the
 * range they support and the shell refuses to mount incompatible ones.
 */
export interface HostApi {
  readonly contractVersion: string;
  /** Identity of the remote this scoped instance was issued to. */
  readonly remote: RemoteIdentity;
  readonly env: HostEnvironment;
  readonly auth: AuthApi;
  readonly http: HttpClient;
  readonly events: EventBus;
  readonly intents: IntentsApi;
  readonly state: HostStateApi;
  readonly navigation: NavigationApi;
  readonly marketData: MarketDataApi;
  readonly notifications: NotificationsApi;
  readonly flags: FeatureFlagsApi;
  readonly telemetry: TelemetryApi;
}

export interface RemoteIdentity {
  readonly name: string;
  readonly module: string;
}

export interface HostEnvironment {
  readonly name: 'local' | 'development' | 'staging' | 'production';
  /** Base URL of the BFF API (same-origin path, e.g. `/api`). */
  readonly apiBaseUrl: string;
  readonly shellVersion: string;
}

/* -------------------------------------------------------------------- Auth */

export interface AuthApi {
  getSession(): Session;
  getUser(): SessionUser;
  hasPermission(permission: Permission): boolean;
  canAccessPortfolio(portfolioId: string): boolean;
  /**
   * Headers a remote's *own* transport must attach (CSRF token, trace
   * context, client attribution). Remotes using `host.http` never need this.
   */
  getRequestHeaders(method: string): Record<string, string>;
  /** Report a 401 observed by a remote's own transport (e.g. Ext.Ajax). */
  reportUnauthorized(): void;
  signOut(): Promise<void>;
  subscribe(listener: (session: Session) => void): Unsubscribe;
}

/* -------------------------------------------------------------------- HTTP */

/** Anything with a zod-compatible `parse` - lets callers validate responses. */
export interface ResponseParser<T> {
  parse(data: unknown): T;
}

export type QueryValue = string | number | boolean | null | undefined;

export interface HttpRequestOptions<T = unknown> {
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly parser?: ResponseParser<T>;
}

export interface HttpClient {
  get<T>(path: string, options?: HttpRequestOptions<T>): Promise<T>;
  post<T>(path: string, body?: unknown, options?: HttpRequestOptions<T>): Promise<T>;
  put<T>(path: string, body?: unknown, options?: HttpRequestOptions<T>): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: HttpRequestOptions<T>): Promise<T>;
  delete<T>(path: string, options?: HttpRequestOptions<T>): Promise<T>;
}

/* ------------------------------------------------------------------- State */

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';
export type Density = 'comfortable' | 'compact';

/** Cross-cutting UI state owned by the shell. Read-only for remotes. */
export interface HostStateSnapshot {
  readonly theme: ThemeMode;
  readonly themePreference: ThemePreference;
  readonly density: Density;
  readonly locale: string;
  readonly timeZone: string;
  /** Portfolio selected in the shell's context picker (`null` = all). */
  readonly activePortfolioId: string | null;
  readonly online: boolean;
}

export interface HostStateApi {
  getSnapshot(): HostStateSnapshot;
  subscribe(listener: (state: HostStateSnapshot, previous: HostStateSnapshot) => void): Unsubscribe;
  /** The only state mutation remotes may request. */
  setActivePortfolio(portfolioId: string | null): void;
}

/* -------------------------------------------------------------- Navigation */

export interface HostLocation {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}

export interface NavigationApi {
  getLocation(): HostLocation;
  navigate(to: string, options?: { readonly replace?: boolean }): void;
  subscribe(listener: (location: HostLocation) => void): Unsubscribe;
}

/* ------------------------------------------------------------- Market data */

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'offline';

/**
 * Real-time quotes multiplexed over the shell's single server stream, so N
 * remotes never open N connections. Updates are coalesced per animation frame.
 */
export interface MarketDataApi {
  getQuote(symbol: string): Quote | undefined;
  subscribe(
    symbols: readonly string[] | '*',
    listener: (quotes: ReadonlyMap<string, Quote>) => void,
  ): Unsubscribe;
  getStatus(): ConnectionStatus;
  subscribeStatus(listener: (status: ConnectionStatus) => void): Unsubscribe;
}

/* ----------------------------------------------------------- Notifications */

export type Severity = 'info' | 'success' | 'warning' | 'error';

export interface NotificationAction {
  readonly label: string;
  readonly intent?: IntentRequest;
  readonly href?: string;
}

export interface ToastOptions {
  readonly message: string;
  readonly severity?: Severity;
  readonly action?: NotificationAction;
  readonly durationMs?: number;
}

export interface InboxNotification {
  readonly title: string;
  readonly message: string;
  readonly severity: Severity;
  readonly action?: NotificationAction;
}

export interface NotificationsApi {
  /** Transient snackbar. */
  toast(options: ToastOptions): void;
  /** Persistent entry in the shell's notification center. */
  publish(notification: InboxNotification): void;
}

/* ----------------------------------------------------------------- Intents */

export interface IntentsApi {
  dispatch<K extends MeridianIntent>(intent: K, payload: MeridianIntentMap[K]): Promise<void>;
}

/* ------------------------------------------------------------ Flags & obs. */

export interface FeatureFlagsApi {
  isEnabled(flag: FeatureFlag | (string & {})): boolean;
  getAll(): Readonly<Record<string, boolean>>;
}

export type TelemetryAttributes = Readonly<
  Record<string, string | number | boolean | null | undefined>
>;

export interface TelemetryApi {
  track(name: string, attributes?: TelemetryAttributes): void;
  error(error: unknown, attributes?: TelemetryAttributes): void;
  /** Records the duration of `work` as a timing metric and returns its result. */
  measure<T>(name: string, work: () => Promise<T>, attributes?: TelemetryAttributes): Promise<T>;
}
