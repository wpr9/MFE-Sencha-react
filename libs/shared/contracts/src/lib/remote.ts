import type { HostApi } from './host-api';

/**
 * Semantic version of the Host API implemented by the shell.
 * Remotes declare a caret range (`^1.0.0`) in `RemoteModule.hostContract`.
 */
export const HOST_CONTRACT_VERSION = '1.0.0';

export type RemoteProps = Readonly<Record<string, unknown>>;

export interface RemoteMountContext<P extends object = RemoteProps> {
  readonly host: HostApi;
  /**
   * URL prefix the remote owns (e.g. `/portfolios`). Widgets that do not
   * route receive an empty string.
   */
  readonly basePath: string;
  readonly props: P;
  /** Present when mounted in a dismissible surface (drawer, dialog). */
  readonly close?: () => void;
}

export interface RemoteInstance<P extends object = RemoteProps> {
  /** Receives new props without a remount (widgets, overlays). */
  update?(props: P): void;
  unmount(): void | Promise<void>;
}

/**
 * Lifecycle contract every federated module exposes as its default export -
 * regardless of the framework it is written in (React, Ext JS, ...).
 * Inspired by single-spa parcels: the host owns *where* and *when*, the
 * remote owns *how* it renders.
 */
export interface RemoteModule<P extends object = RemoteProps> {
  /** Supported Host API range, e.g. `^1.0.0`. */
  readonly hostContract: string;
  mount(
    element: HTMLElement,
    context: RemoteMountContext<P>,
  ): RemoteInstance<P> | Promise<RemoteInstance<P>>;
}

export function isRemoteModule(value: unknown): value is RemoteModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RemoteModule).mount === 'function' &&
    typeof (value as RemoteModule).hostContract === 'string'
  );
}

/**
 * Minimal caret-range check (`^MAJOR.MINOR.PATCH`) for contract negotiation,
 * so the browser bundle does not need a full semver implementation.
 */
export function satisfiesContract(range: string, version: string = HOST_CONTRACT_VERSION): boolean {
  const parse = (value: string) =>
    value
      .replace(/^\^/, '')
      .split('.')
      .map((part) => Number(part));
  const [rMajor = NaN, rMinor = 0, rPatch = 0] = parse(range);
  const [vMajor = NaN, vMinor = 0, vPatch = 0] = parse(version);
  if (!range.startsWith('^') || Number.isNaN(rMajor) || Number.isNaN(vMajor)) return false;
  if (rMajor !== vMajor) return false;
  if (vMinor !== rMinor) return vMinor > rMinor;
  return vPatch >= rPatch;
}
