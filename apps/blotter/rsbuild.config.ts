import { defineRemoteConfig } from '../../tools/mf/define-remote';

/**
 * Sencha Ext JS remote. Ext JS itself is NOT bundled: it is a global,
 * script-loaded framework, served as static assets from this remote's own
 * origin (`public/vendor/extjs`) and loaded lazily by `src/remote/ext-runtime`.
 * Only the integration layer and the Ext class definitions are federated, and
 * they share nothing with the host (no React in this remote).
 */
export default defineRemoteConfig({
  name: 'blotter',
  port: 4204,
  title: 'Orders (standalone) - Meridian',
  exposes: {
    './App': './src/remote/app.ts',
    './RecentOrdersWidget': './src/remote/recent-orders-widget.ts',
  },
  shared: {},
});
