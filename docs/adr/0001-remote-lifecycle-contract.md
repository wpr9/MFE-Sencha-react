# ADR-0001: One framework-agnostic lifecycle contract for every remote

**Status:** accepted

## Context

The workspace hosts React remotes and a Sencha Ext JS remote, as pages,
dashboard widgets and overlays. Nx's default React Module Federation setup
renders remote React components inside the host's React tree, which only works
for React and couples React versions and contexts across teams.

## Decision

Every federated module default-exports a `RemoteModule`
(`@meridian/contracts`):

```ts
interface RemoteModule<P> {
  hostContract: string; // e.g. "^1.0.0"
  mount(
    el: HTMLElement,
    ctx: { host: HostApi; basePath: string; props: P; close?: () => void },
  ): RemoteInstance<P> | Promise<RemoteInstance<P>>;
}
interface RemoteInstance<P> {
  update?(props: P): void;
  unmount(): void | Promise<void>;
}
```

- React remotes implement it with `defineReactRemote()` (own root, providers,
  error boundary, memory router synced with the shell URL).
- Ext JS remotes implement it with `defineExtRemote()`.
- The shell mounts everything through one component, `RemoteOutlet`, and
  checks `hostContract` against `HOST_CONTRACT_VERSION` before mounting.

## Consequences

- Framework independence, uniform error isolation, one mounting code path.
- Independent React upgrades per remote become possible.
  − Remotes cannot consume shell React context directly; they use the Host API.
  − Two routers per React page (shell + remote memory router), kept in sync.
