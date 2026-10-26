import {
  HOST_CONTRACT_VERSION,
  describeError,
  isRemoteModule,
  satisfiesContract,
  type HostEnvironment,
  type RemoteModule,
} from '@meridian/contracts';
import { loadRemote, preloadRemote, registerRemotes } from '@module-federation/enhanced/runtime';
import { z } from 'zod';

// Only web origins can host a manifest: `javascript:` or `data:` entries are refused here.
const RegistryEntrySchema = z.object({
  entry: z.url({ protocol: /^https?$/ }),
  version: z.string().optional(),
});
const EnvironmentSchema = z.enum(['local', 'development', 'staging', 'production']);
const RegistryDocumentSchema = z.object({
  environment: EnvironmentSchema.optional(),
  remotes: z.record(z.string(), z.unknown()),
});

export interface RemoteRegistry {
  /**
   * Deployment environment the registry was rendered for. The same shell
   * artefact is promoted between environments; this is how it learns which
   * one it is in (telemetry labels, flag overrides).
   */
  readonly environment: HostEnvironment['name'] | undefined;
  readonly remotes: Readonly<Record<string, z.infer<typeof RegistryEntrySchema>>>;
}

/** A registry entry (or the whole registry, `*`) that could not be used. */
export interface RegistryProblem {
  readonly remote: string;
  readonly error: string;
}

export type RemoteStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; loadMs: number; contract: string }
  | { state: 'failed'; error: string };

/** A slow CDN still answers well within this; past it the outlet shows an error with Retry. */
const REMOTE_LOAD_TIMEOUT_MS = 20_000;

let registry: RemoteRegistry = { environment: undefined, remotes: {} };
let registryProblems: readonly RegistryProblem[] = [];
const modules = new Map<string, Promise<RemoteModule>>();
const statuses = new Map<string, RemoteStatus>();
const statusListeners = new Set<() => void>();
/** Bumped on every status change: a cheap, stable snapshot for `useSyncExternalStore`. */
let statusVersion = 0;

export class RemoteLoadError extends Error {
  override readonly name = 'RemoteLoadError';
}

/**
 * Runtime remote discovery: the registry is environment configuration
 * fetched at boot (never baked into the shell bundle), so a remote can be
 * redeployed - or rolled back - without rebuilding the shell.
 *
 * Entries are validated one by one: a broken entry - or an unreachable
 * registry - only takes out the remotes it concerns. The shell still boots
 * and each affected outlet shows a contained error with retry.
 */
export async function loadRemoteRegistry(url = '/config/remotes.json'): Promise<RemoteRegistry> {
  const problems: RegistryProblem[] = [];
  let document: unknown = { remotes: {} };
  try {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new RemoteLoadError(`Registry unavailable (HTTP ${response.status})`);
    document = await response.json();
  } catch (error) {
    problems.push({ remote: '*', error: describeError(error) });
  }
  const parsed = RegistryDocumentSchema.safeParse(document);
  if (!parsed.success) problems.push({ remote: '*', error: 'Malformed registry document' });
  const remotes: Record<string, z.infer<typeof RegistryEntrySchema>> = {};
  for (const [name, raw] of Object.entries(parsed.success ? parsed.data.remotes : {})) {
    const entry = RegistryEntrySchema.safeParse(raw);
    if (entry.success) remotes[name] = entry.data;
    else
      problems.push({
        remote: name,
        error: 'Invalid entry (an absolute http(s) manifest URL is required)',
      });
  }
  registry = { environment: parsed.success ? parsed.data.environment : undefined, remotes };
  registryProblems = problems;
  registerRemotes(Object.entries(remotes).map(([name, remote]) => ({ name, entry: remote.entry })));
  return registry;
}

/** The registry loaded at boot. */
export function getRegistry(): RemoteRegistry {
  return registry;
}

/** Entries the boot could not use (reported to telemetry and on the Platform page). */
export function getRegistryProblems(): readonly RegistryProblem[] {
  return registryProblems;
}

/** Load state of one module, for diagnostics. */
export function getRemoteStatus(id: string): RemoteStatus {
  return statuses.get(id) ?? { state: 'idle' };
}

export function getStatusVersion(): number {
  return statusVersion;
}

/** Notifies on any module status or outage change; pair with `getStatusVersion`. */
export function subscribeRemoteStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function notifyStatus() {
  statusVersion += 1;
  for (const listener of [...statusListeners]) listener();
}

function setStatus(id: string, status: RemoteStatus) {
  statuses.set(id, status);
  notifyStatus();
}

/**
 * Fault injection for resilience drills (Platform page): the loader fails a
 * remote exactly as if its manifest were unreachable. Already mounted
 * instances keep running - as they would during a real outage - while every
 * new mount shows the contained error state, and recovers through Retry.
 */
const outages = new Set<string>();

export function isOutageSimulated(remote: string): boolean {
  return outages.has(remote);
}

export function setOutageSimulated(remote: string, down: boolean): void {
  if (down) outages.add(remote);
  else outages.delete(remote);
  for (const id of [...modules.keys()]) {
    if (id.startsWith(`${remote}/`)) modules.delete(id); // next mount goes through the loader
  }
  notifyStatus();
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RemoteLoadError(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** `remote/Module`: the Module Federation id of an exposed module. */
export const moduleId = (remote: string, module: string) =>
  `${remote}/${module.replace(/^\.\//, '')}`;

/**
 * Loads a federated module and negotiates the host contract before anything
 * is mounted: a remote built against an incompatible Host API is refused
 * with a clear error instead of failing at runtime in some code path.
 */
export function loadRemoteModule(remote: string, module: string): Promise<RemoteModule> {
  const id = moduleId(remote, module);
  let pending = modules.get(id);
  if (!pending) {
    const startedAt = performance.now();
    setStatus(id, { state: 'loading' });
    pending = (async () => {
      if (outages.has(remote))
        throw new RemoteLoadError(`Remote "${remote}" is unreachable (simulated outage)`);
      if (!registry.remotes[remote])
        throw new RemoteLoadError(`Remote "${remote}" is not registered in this environment`);
      const loaded = await withTimeout(
        loadRemote<{ default: unknown }>(id),
        REMOTE_LOAD_TIMEOUT_MS,
        `Timed out loading ${id}`,
      );
      const candidate = loaded?.default;
      if (!isRemoteModule(candidate))
        throw new RemoteLoadError(`${id} does not implement the remote lifecycle contract`);
      if (!satisfiesContract(candidate.hostContract, HOST_CONTRACT_VERSION)) {
        throw new RemoteLoadError(
          `${id} requires host contract ${candidate.hostContract}; this shell provides ${HOST_CONTRACT_VERSION}`,
        );
      }
      // The drill may have started while this load was in flight: an "offline" remote
      // must not report itself mounted and ready.
      if (outages.has(remote))
        throw new RemoteLoadError(`Remote "${remote}" is unreachable (simulated outage)`);
      setStatus(id, {
        state: 'ready',
        loadMs: Math.round(performance.now() - startedAt),
        contract: candidate.hostContract,
      });
      return candidate;
    })();
    modules.set(id, pending);
    pending.catch((error: unknown) => {
      modules.delete(id); // allow a retry
      setStatus(id, { state: 'failed', error: describeError(error) });
    });
  }
  return pending;
}

/** Warms a remote (manifest, entry and its assets) ahead of navigation, e.g. on hover. */
export function prefetchRemote(remote: string): void {
  if (!registry.remotes[remote]) return;
  // Best effort: a failed prefetch is not an error; the real load reports if it fails too.
  void preloadRemote([{ nameOrAlias: remote, resourceCategory: 'sync' }]).catch(() => undefined);
}
