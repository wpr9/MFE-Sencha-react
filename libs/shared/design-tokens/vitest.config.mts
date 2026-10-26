import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/shared/design-tokens',
  plugins: [tsconfigPaths({ root: '../../../' })],
  test: {
    name: 'design-tokens',
    watch: false,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/shared/design-tokens',
      provider: 'v8',
    },
  },
});
