import { pluginReact } from '@rsbuild/plugin-react';
import { defineRemoteConfig } from '../../tools/mf/define-remote';

/** `compliance` remote. Exposes framework-agnostic lifecycle modules (see @meridian/contracts). */
export default defineRemoteConfig({
  name: 'compliance',
  port: 4203,
  title: 'Compliance (standalone) - Meridian',
  exposes: {
    './App': './src/remote/app.tsx',
    './AlertsWidget': './src/remote/alerts-widget.tsx',
  },
  plugins: [pluginReact()],
});
