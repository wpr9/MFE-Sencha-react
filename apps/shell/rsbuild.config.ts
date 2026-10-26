import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registryOrigins, strictCsp } from '../../tools/mf/csp';
import { BFF_PROXY } from '../../tools/mf/dev-server';
import { REACT_SHARED } from '../../tools/mf/shared';

/**
 * CSP nonce. Production HTML carries a placeholder that the ingress replaces
 * with a fresh value per response (nginx `sub_filter`); the dev server, which
 * cannot rewrite responses, uses one random value per process. Either way the
 * strict policy is enforced in development too, so violations surface early.
 */
const PROD_NONCE_PLACEHOLDER = '__CSP_NONCE__';
const DEV_NONCE = randomBytes(18).toString('base64');
const PORT = 4200;

function devCsp(): string {
  const registry = JSON.parse(readFileSync(join(__dirname, 'public/config/remotes.json'), 'utf8'));
  const remoteOrigins = registryOrigins(registry);
  return strictCsp({
    nonce: DEV_NONCE,
    remoteOrigins,
    // Hot-module-replacement sockets of the shell and every remote dev server.
    connect: [
      `ws://localhost:${PORT}`,
      ...remoteOrigins.map((origin) => origin.replace(/^http/, 'ws')),
    ],
  });
}

/**
 * Shell (Module Federation host). Remotes are NOT listed at build time: the
 * shell reads `/config/remotes.json` at runtime, so each remote deploys
 * independently and environments differ only by that file.
 */
export default defineConfig(({ command }) => ({
  server: {
    port: PORT,
    proxy: BFF_PROXY,
    headers: command === 'dev' ? { 'Content-Security-Policy': devCsp() } : undefined,
  },
  security: { nonce: command === 'dev' ? DEV_NONCE : PROD_NONCE_PLACEHOLDER },
  dev: { lazyCompilation: false },
  output: { distPath: { root: 'dist' }, assetPrefix: '/' },
  html: { template: './index.html' },
  source: {
    entry: { index: './src/index.ts' },
    define: { __SHELL_VERSION__: JSON.stringify(process.env['SHELL_VERSION'] ?? '1.0.0-dev') },
  },
  plugins: [
    pluginReact(),
    pluginModuleFederation({
      name: 'shell',
      dts: false,
      shared: REACT_SHARED,
    }),
  ],
}));
