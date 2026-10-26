import { Box, LinearProgress, Skeleton, Stack } from '@mui/material';
import { describeError, type RemoteInstance, type RemoteProps } from '@meridian/contracts';
import { ErrorState } from '@meridian/ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { recordMessageFlow } from '../message-flow';
import { usePlatform } from '../platform-context';
import { loadRemoteModule, moduleId } from '../remotes';

export interface RemoteOutletProps {
  readonly remote: string;
  readonly module: string;
  /** Human label for loading/error copy, e.g. "Orders". */
  readonly label: string;
  readonly basePath?: string;
  /** Shell -> remote input. Keep the object stable: a new identity calls the remote's `update()`. */
  readonly props?: RemoteProps;
  readonly onClose?: () => void;
  /** A `page` fills the content panel; `embedded` sits in a card or side sheet. */
  readonly variant?: 'page' | 'embedded';
}

type State = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: Error };

/**
 * Mounts a federated module through the framework-agnostic lifecycle
 * contract. The same component hosts React and Ext JS remotes.
 *
 * Isolation: a remote that fails to load, violates the contract or throws
 * while mounting degrades to an inline error with retry; the shell and every
 * other remote keep working.
 */
export function RemoteOutlet({
  remote,
  module,
  label,
  basePath = '',
  props,
  onClose,
  variant = 'page',
}: RemoteOutletProps) {
  const platform = usePlatform();
  const id = moduleId(remote, module);
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<RemoteInstance | null>(null);
  const propsRef = useRef<RemoteProps>(props ?? {});
  /** Props the mounted instance currently has; `null` until it is mounted. */
  const appliedPropsRef = useRef<RemoteProps | null>(null);
  const closeRef = useRef(onClose);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // Latest props/close for the (async) mount, without re-running the mount effect.
  useLayoutEffect(() => {
    propsRef.current = props ?? {};
    closeRef.current = onClose;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let cancelled = false;
    // A fresh mount point per attempt: a deferred unmount of the previous
    // React root can never collide with the next createRoot().
    const mountPoint = document.createElement('div');
    mountPoint.className = 'mrd-remote-root';
    mountPoint.dataset['remote'] = id;
    container.append(mountPoint);
    appliedPropsRef.current = null;
    setState({ status: 'loading' });

    const telemetry = platform.telemetry.forSource('shell');
    const startedAt = performance.now();
    (async () => {
      const remoteModule = await loadRemoteModule(remote, module);
      if (cancelled) return;
      const mountProps = propsRef.current;
      const instance = await remoteModule.mount(mountPoint, {
        host: platform.hostFor({ name: remote, module }),
        basePath,
        props: mountProps,
        close: () => closeRef.current?.(),
      });
      if (cancelled) {
        void instance.unmount();
        return;
      }
      instanceRef.current = instance;
      appliedPropsRef.current = mountProps;
      telemetry.track('remote.mounted', {
        remote: id,
        durationMs: Math.round(performance.now() - startedAt),
      });
      setState({ status: 'ready' });
    })().catch((error: unknown) => {
      if (cancelled) return;
      telemetry.error(error, { kind: 'remote-mount', remote: id });
      setState({
        status: 'error',
        error: error instanceof Error ? error : new Error(describeError(error)),
      });
    });

    return () => {
      cancelled = true;
      const instance = instanceRef.current;
      instanceRef.current = null;
      mountPoint.style.display = 'none';
      // Runs inside React's commit phase: a remote's failing teardown is reported and
      // contained here, so it can never take the shell (or other remotes) down.
      let teardown: Promise<void>;
      try {
        teardown = Promise.resolve(instance?.unmount());
      } catch (error) {
        teardown = Promise.reject(error);
      }
      void teardown
        .catch((error: unknown) => telemetry.error(error, { kind: 'remote-unmount', remote: id }))
        .finally(() => setTimeout(() => mountPoint.remove(), 0));
    };
  }, [platform, remote, module, id, basePath, attempt]);

  // Shell -> remote props. This is the boundary crossing, so it is also where the
  // message flow records it; the props the remote was mounted with are not re-sent.
  useEffect(() => {
    const next = props ?? {};
    if (state.status !== 'ready' || appliedPropsRef.current === next) return;
    appliedPropsRef.current = next;
    instanceRef.current?.update?.(next);
    recordMessageFlow({
      kind: 'props',
      from: 'shell',
      to: id,
      label: 'props',
      detail: JSON.stringify(next),
    });
  }, [props, state.status, id]);

  return (
    <Box
      sx={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        '& > .mrd-remote-host > .mrd-remote-root': {
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        },
        '& > .mrd-remote-host > .mrd-remote-root > *': { flex: '1 0 auto' },
      }}
    >
      {state.status === 'loading' && <RemoteLoading variant={variant} label={label} />}
      {state.status === 'error' && (
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <ErrorState
            compact={variant === 'embedded'}
            title={`${label} is temporarily unavailable`}
            message="This part of the workspace failed to load. Everything else keeps working."
            detail={state.error.message}
            onRetry={() => setAttempt((value) => value + 1)}
          />
        </Box>
      )}
      <Box
        ref={containerRef}
        className="mrd-remote-host"
        aria-busy={state.status === 'loading'}
        sx={{
          flex: 1,
          minHeight: 0,
          display: state.status === 'error' ? 'none' : 'flex',
          flexDirection: 'column',
          visibility: state.status === 'loading' ? 'hidden' : 'visible',
        }}
      />
    </Box>
  );
}

function RemoteLoading({
  variant,
  label,
}: {
  readonly variant: RemoteOutletProps['variant'];
  readonly label: string;
}) {
  return (
    <Box
      role="status"
      aria-label={`Loading ${label}`}
      sx={{ position: 'absolute', inset: 0, zIndex: 1, bgcolor: 'background.paper' }}
    >
      <LinearProgress
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          borderRadius: 0,
          bgcolor: 'transparent',
        }}
      />
      {variant === 'page' ? (
        <Stack spacing={2.5} sx={{ p: 3 }}>
          <Skeleton variant="text" width={220} sx={{ fontSize: 32 }} />
          <Skeleton variant="text" width={360} />
          <Stack direction="row" spacing={2}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={104} sx={{ flex: 1 }} />
            ))}
          </Stack>
          <Skeleton variant="rounded" height={320} />
        </Stack>
      ) : (
        <Stack spacing={1.5} sx={{ p: 2 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={28} />
          ))}
        </Stack>
      )}
    </Box>
  );
}
