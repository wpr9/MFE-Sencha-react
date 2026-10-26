import type { Platform } from '@meridian/platform';
import { MeridianThemeProvider } from '@meridian/ui';
import { useEffect, type ReactNode } from 'react';
import { RouterProvider } from 'react-router/dom';
import type { createAppRouter } from './router';
import { PlatformProvider, useHostStore } from './platform-context';

function ShellTheme({ children }: { readonly children: ReactNode }) {
  const theme = useHostStore((state) => state.theme);
  const density = useHostStore((state) => state.density);
  useEffect(() => {
    // Non-React surfaces (Ext JS remote, dev host) theme themselves from this
    // attribute through the design-token CSS variables.
    document.documentElement.dataset['theme'] = theme;
    document.documentElement.dataset['density'] = density;
    document.documentElement.style.colorScheme = theme;
  }, [theme, density]);
  return (
    <MeridianThemeProvider mode={theme} density={density} baseline>
      {children}
    </MeridianThemeProvider>
  );
}

/** Root of the shell's React tree: platform context, theme, router. */
export function App({
  platform,
  router,
}: {
  readonly platform: Platform;
  readonly router: ReturnType<typeof createAppRouter>;
}) {
  return (
    <PlatformProvider platform={platform}>
      <ShellTheme>
        <RouterProvider router={router} />
      </ShellTheme>
    </PlatformProvider>
  );
}
