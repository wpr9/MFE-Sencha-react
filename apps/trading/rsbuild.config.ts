import { pluginReact } from '@rsbuild/plugin-react';
import { defineRemoteConfig } from '../../tools/mf/define-remote';

/** `trading` remote. Exposes framework-agnostic lifecycle modules (see @meridian/contracts). */
export default defineRemoteConfig({
  name: 'trading',
  port: 4202,
  title: 'Market (standalone) - Meridian',
  exposes: {
    './App': './src/remote/app.tsx',
    './OrderTicket': './src/remote/order-ticket.tsx',
    './MoversWidget': './src/remote/movers-widget.tsx',
    './SecurityInsight': './src/remote/security-insight.tsx',
  },
  plugins: [pluginReact()],
});
