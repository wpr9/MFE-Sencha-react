/**
 * Dev-server settings shared by the shell and every remote.
 *
 * - The BFF is reached through a same-origin proxy (`/api`, `/auth`), exactly
 *   like the production ingress, so cookies stay first-party and SameSite=Strict.
 * - Remotes serve federated chunks and static assets (fonts, the Ext JS
 *   runtime) to the shell's origin, hence the CORS header in development.
 */
export const BFF_ORIGIN = process.env['BFF_ORIGIN'] ?? 'http://127.0.0.1:3333';

export const BFF_PROXY = {
  '/api': { target: BFF_ORIGIN, changeOrigin: false },
  '/auth': { target: BFF_ORIGIN, changeOrigin: false },
};

export const REMOTE_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
};
