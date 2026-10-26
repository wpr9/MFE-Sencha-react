import '@fontsource-variable/google-sans';
import '@fontsource-variable/roboto';
import '@fontsource-variable/roboto-mono';
import { startDevHost } from '@meridian/dev-host';

// Standalone development: the remote runs against the real BFF and platform
// services without the shell (`nx serve portfolio`).
void startDevHost({
  remoteName: 'portfolio',
  title: 'Portfolios',
  basePath: '/portfolios',
  load: () => import('./remote/app'),
});
