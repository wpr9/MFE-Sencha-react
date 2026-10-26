import '@fontsource-variable/google-sans';
import '@fontsource-variable/roboto';
import '@fontsource-variable/roboto-mono';
import { startDevHost } from '@meridian/dev-host';

void startDevHost({
  remoteName: 'blotter',
  title: 'Orders blotter',
  basePath: '/orders',
  load: () => import('./remote/app'),
});
