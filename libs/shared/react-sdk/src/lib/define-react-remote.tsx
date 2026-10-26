import {
  HOST_CONTRACT_VERSION,
  isHttpError,
  type HostApi,
  type HostLocation,
  type RemoteMountContext,
  type RemoteModule,
  type RemoteProps,
} from '@meridian/contracts';
import createCache, { type EmotionCache } from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { EmptyState, ErrorState, MeridianThemeProvider } from '@meridian/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Component,
  StrictMode,
  useEffect,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  Outlet,
  createMemoryRouter,
  isRouteErrorResponse,
  useLocation,
  useNavigate,
  useRouteError,
  type RouteObject,
} from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { HostProvider, useHost, useHostState } from './hooks';

/** Copy shown when a remote's React tree throws; the shell chrome keeps working around it. */
const CRASH_COPY = {
  title: 'This view crashed',
  message:
    'The rest of the workspace is unaffected. Try again, or reload the page if the problem persists.',
} as const;

export interface WidgetProps {
  /** Present when the host renders the widget in a dismissible surface. */
  readonly close?: () => void;
}

export interface ReactRemoteOptions<P extends object> {
  /** Page remotes: route tree relative to the remote's `basePath`. */
  readonly routes?: RouteObject[];
  /** Widget remotes: a component receiving the host-supplied props. */
  readonly component?: ComponentType<P & WidgetProps>;
}

class RemoteErrorBoundary extends Component<
  { host: HostApi; children: ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.host.telemetry.error(error, {
      kind: 'react-render',
      componentStack: info.componentStack?.slice(0, 500),
    });
  }

  override render() {
    if (this.state.error) {
      return (
        <ErrorState
          title={CRASH_COPY.title}
          message={CRASH_COPY.message}
          detail={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

function RemoteTheme({ children }: { readonly children: ReactNode }) {
  const mode = useHostState((state) => state.theme);
  const density = useHostState((state) => state.density);
  return (
    <MeridianThemeProvider mode={mode} density={density}>
      {children}
    </MeridianThemeProvider>
  );
}

const href = (location: Pick<HostLocation, 'pathname' | 'search' | 'hash'>) =>
  `${location.pathname}${location.search}${location.hash}`;

/**
 * Route-level errors in a page remote. Without it React Router would render its
 * own developer error page (stack trace, no retry) and nothing would reach
 * telemetry. Unknown sub-paths are a friendly 404 inside the remote.
 */
function RemoteRouteError() {
  const error = useRouteError();
  const host = useHost();
  const navigate = useNavigate();
  const location = useLocation();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  useEffect(() => {
    if (!notFound) host.telemetry.error(error, { kind: 'react-route', path: location.pathname });
  }, [error, host, location.pathname, notFound]);
  if (notFound) {
    return (
      <EmptyState title="Page not found" description={`Nothing lives at ${location.pathname}.`} />
    );
  }
  return (
    <ErrorState
      title={CRASH_COPY.title}
      message={CRASH_COPY.message}
      detail={error instanceof Error ? error.message : undefined}
      // Re-navigating to the same location clears the route error without a page reload.
      onRetry={() => void navigate(href(location), { replace: true })}
    />
  );
}

/**
 * One style cache per remote, not per mount: every mount of a remote reuses the
 * rules it already inserted, so navigating back and forth never piles up CSS.
 */
const emotionCaches = new Map<string, EmotionCache>();
function emotionCacheFor(remoteName: string): EmotionCache {
  // Each remote bundles its own MUI/Emotion; a unique key keeps their style sheets apart.
  const key = `mrd-${remoteName.toLowerCase().replace(/[^a-z]/g, '')}`;
  let cache = emotionCaches.get(key);
  if (!cache) {
    cache = createCache({ key });
    emotionCaches.set(key, cache);
  }
  return cache;
}

/**
 * The remote owns an in-memory router; the shell owns the URL. Both are kept
 * in sync in each direction, which gives remotes idiomatic React Router
 * (`<Link>`, `useParams`, nested routes) without two routers fighting over
 * `window.history`.
 */
function createSyncedRouter(
  context: Pick<RemoteMountContext<object>, 'host' | 'basePath'>,
  routes: RouteObject[],
) {
  const { host, basePath } = context;
  const router = createMemoryRouter(
    [
      {
        path: basePath || '/',
        element: <Outlet />,
        errorElement: <RemoteRouteError />,
        children: routes,
      },
    ],
    {
      initialEntries: [href(host.navigation.getLocation())],
    },
  );
  const stopHost = host.navigation.subscribe((location) => {
    if (basePath && !location.pathname.startsWith(basePath)) return; // shell is about to unmount us
    if (href(location) !== href(router.state.location))
      void router.navigate(href(location), { replace: true });
  });
  const stopRouter = router.subscribe((state) => {
    const target = href(state.location);
    if (target !== href(host.navigation.getLocation())) {
      // Only PUSH adds a browser entry: a POP (navigate(-1)) must not become a new
      // forward step, or the browser's Back would return to the page just left.
      host.navigation.navigate(target, { replace: state.historyAction !== 'PUSH' });
    }
  });
  return {
    router,
    dispose() {
      stopHost();
      stopRouter();
      router.dispose();
    },
  };
}

/**
 * Implements the platform lifecycle contract for a React remote. Each mount
 * gets its own React root, QueryClient and error boundary, so remotes are
 * isolated from each other and from the shell even though React itself is a
 * shared singleton.
 */
export function defineReactRemote<P extends object = RemoteProps>(
  options: ReactRemoteOptions<P>,
): RemoteModule<P> {
  if (!options.routes && !options.component)
    throw new Error('defineReactRemote needs `routes` or `component`');
  return {
    hostContract: `^${HOST_CONTRACT_VERSION}`,
    mount(element, context) {
      const { host } = context;
      const root = createRoot(element, {
        identifierPrefix: `${host.remote.name}-`,
        onRecoverableError: (error) => host.telemetry.error(error, { kind: 'react-recoverable' }),
      });
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Client errors (4xx) are deterministic; only transient failures are retried.
            retry: (failureCount, error) =>
              !(isHttpError(error) && error.status < 500) && failureCount < 2,
          },
        },
      });
      const emotionCache = emotionCacheFor(host.remote.name);
      const synced = options.routes ? createSyncedRouter(context, options.routes) : null;
      const Widget = options.component;
      let props = context.props;

      const render = () =>
        root.render(
          <StrictMode>
            <CacheProvider value={emotionCache}>
              <HostProvider host={host}>
                <RemoteTheme>
                  <QueryClientProvider client={queryClient}>
                    <RemoteErrorBoundary host={host}>
                      {synced ? (
                        <RouterProvider router={synced.router} />
                      ) : Widget ? (
                        <Widget {...props} close={context.close} />
                      ) : null}
                    </RemoteErrorBoundary>
                  </QueryClientProvider>
                </RemoteTheme>
              </HostProvider>
            </CacheProvider>
          </StrictMode>,
        );
      render();

      return {
        update(next) {
          props = next;
          render();
        },
        unmount() {
          synced?.dispose();
          // Defer: the host may unmount us from inside its own React commit phase.
          setTimeout(() => {
            root.unmount();
            queryClient.clear();
          }, 0);
        },
      };
    },
  };
}
