import { createBrowserRouter } from 'react-router';
import { AppShell } from './layout/AppShell';
import { DeskPage } from './pages/DeskPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage, PageErrorPage, RouteErrorPage } from './pages/StatusPages';
import { PlatformPage } from './pages/platform/PlatformPage';
import { RemotePage, RequirePermission } from './pages/RemotePage';
import { SettingsPage } from './pages/SettingsPage';

/**
 * Route tree. Each `/<app>/*` subtree belongs to one remote, which handles
 * everything below its base path with its own (synchronised) router.
 */
export function createAppRouter() {
  return createBrowserRouter([
    {
      element: <AppShell />,
      // Last resort: only reached if the shell chrome itself fails.
      errorElement: <RouteErrorPage />,
      children: [
        {
          // A failing page is contained here: navigation and top bar stay usable.
          errorElement: <PageErrorPage />,
          children: [
            { index: true, element: <HomePage /> },
            {
              path: 'desk',
              element: (
                <RequirePermission appId="desk">
                  <DeskPage />
                </RequirePermission>
              ),
            },
            { path: 'portfolios/*', element: <RemotePage appId="portfolios" /> },
            { path: 'orders/*', element: <RemotePage appId="orders" /> },
            { path: 'market/*', element: <RemotePage appId="market" /> },
            { path: 'compliance/*', element: <RemotePage appId="compliance" /> },
            { path: 'platform', element: <PlatformPage /> },
            { path: 'settings', element: <SettingsPage /> },
            { path: '*', element: <NotFoundPage /> },
          ],
        },
      ],
    },
  ]);
}
