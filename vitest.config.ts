import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve the workspace package to source so tests don't need a build.
      '@imvu/rest': fileURLToPath(new URL('./packages/rest/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // Existing tests use describe/it/expect/beforeAll/afterAll as globals.
    globals: true,
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts'],
    // Load IMVU_USERNAME/IMVU_PASSWORD from .env (was jest.config.ts's dotenv.config()).
    setupFiles: ['dotenv/config'],
    // The live-API tests share one cached IMVU session (cookies.json) and must not
    // trigger repeated logins. Run files serially — the Vitest equivalent of Jest's
    // --runInBand — so the first login warms the cache and the rest reuse it.
    fileParallelism: false,
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/index.ts'],
    },
  },
});
