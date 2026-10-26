import type { ReactNode } from 'react';
import { CATALOG } from '../catalog';
import { RemoteOutlet } from '../components/RemoteOutlet';
import { useShellHost } from '../platform-context';
import { ForbiddenPage, NotFoundPage } from './StatusPages';

/** A route owned by a federated remote, guarded by the catalog permission. */
export function RemotePage({ appId }: { readonly appId: string }) {
  const host = useShellHost();
  const entry = CATALOG.find((candidate) => candidate.id === appId);
  if (!entry?.remote) return <NotFoundPage />;
  if (entry.permission && !host.auth.hasPermission(entry.permission))
    return <ForbiddenPage what={entry.label} />;
  // Keyed by remote: switching apps remounts; navigating within one does not.
  return (
    <RemoteOutlet
      key={entry.remote.name}
      remote={entry.remote.name}
      module={entry.remote.module}
      label={entry.label}
      basePath={entry.path}
    />
  );
}

/** Guards a shell-native page with the catalog permission of `appId`. */
export function RequirePermission({
  appId,
  children,
}: {
  readonly appId: string;
  readonly children: ReactNode;
}) {
  const host = useShellHost();
  const entry = CATALOG.find((candidate) => candidate.id === appId);
  if (entry?.permission && !host.auth.hasPermission(entry.permission))
    return <ForbiddenPage what={entry.label} />;
  return <>{children}</>;
}
