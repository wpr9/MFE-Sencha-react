import '@fontsource-variable/google-sans';
import '@fontsource-variable/roboto';
import '@fontsource-variable/roboto-mono';
import { startDevHost } from '@meridian/dev-host';

// Standalone development: the remote runs against the real BFF and platform
// services without the shell (`nx serve compliance`).
void startDevHost({
  remoteName: 'compliance',
  title: 'Compliance',
  basePath: '/compliance',
  load: () => import('./remote/app'),
});
