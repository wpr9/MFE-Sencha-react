import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { defineConfig, type RsbuildPlugin } from '@rsbuild/core';

type SharePolicy = NonNullable<Parameters<typeof pluginModuleFederation>[0]['shared']>;
import { BFF_PROXY, REMOTE_CORS_HEADERS } from './dev-server';
import { REACT_SHARED } from './shared';

export interface RemoteConfigOptions {
  /** Module Federation name, as listed in the shell's `remotes.json`. */
  readonly name: string;
  /** Dev-server port (see CLAUDE.md for the port map). */
  readonly port: number;
  /** Title of the standalone dev host page. */
  readonly title: string;
  /** Federated modules: `./Name` -> entry file. */
  readonly exposes: Readonly<Record<string, string>>;
  /** Share policy; defaults to the React singleton family. Framework-agnostic remotes pass `{}`. */
  readonly shared?: SharePolicy;
  readonly plugins?: RsbuildPlugin[];
}

/**
 * Build configuration every remote shares, so the parts that are easy to get
 * wrong are decided once:
 *
 * - `lazyCompilation` stays off: Rsbuild 2's on-demand proxy chunks break when
 *   federated modules are requested cross-origin by the shell.
 * - `assetPrefix: 'auto'`: chunks resolve against the remote's own origin
 *   (its CDN in production), never the shell's.
 * - The standalone dev host (`index.html` + `src/index.ts`) is a development
 *   tool. Production builds emit only the federated modules: no HTML, and the
 *   entry's dev-only import is eliminated at build time.
 */
export function defineRemoteConfig(options: RemoteConfigOptions) {
  const { name, port, title, exposes, shared = REACT_SHARED, plugins = [] } = options;
  return defineConfig(({ command }) => {
    const dev = command === 'dev';
    return {
      server: { port, headers: REMOTE_CORS_HEADERS, proxy: BFF_PROXY },
      dev: { assetPrefix: true, lazyCompilation: false },
      output: { assetPrefix: 'auto', distPath: { root: 'dist' } },
      html: dev ? { template: './index.html', title } : {},
      tools: { htmlPlugin: dev },
      source: { entry: { index: './src/index.ts' } },
      plugins: [
        ...plugins,
        pluginModuleFederation({
          name,
          filename: 'remoteEntry.js',
          manifest: true,
          dts: false,
          exposes,
          shared,
        }),
      ],
    };
  });
}
