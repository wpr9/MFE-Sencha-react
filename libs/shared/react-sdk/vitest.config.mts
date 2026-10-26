import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/shared/react-sdk',
  plugins: [react(), tsconfigPaths({ root: '../../../' })],
  test: {
    name: 'react-sdk',
    watch: false,
    environment: 'jsdom',
    setupFiles: ['../../../tools/testing/vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/shared/react-sdk',
      provider: 'v8',
    },
  },
});
