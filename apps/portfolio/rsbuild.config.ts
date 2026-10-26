import { pluginReact } from '@rsbuild/plugin-react';
import { defineRemoteConfig } from '../../tools/mf/define-remote';

/** `portfolio` remote. Exposes framework-agnostic lifecycle modules (see @meridian/contracts). */
export default defineRemoteConfig({
  name: 'portfolio',
  port: 4201,
  title: 'Portfolios (standalone) - Meridian',
  exposes: {
    './App': './src/remote/app.tsx',
    './SummaryWidget': './src/remote/summary-widget.tsx',
  },
  plugins: [pluginReact()],
});
