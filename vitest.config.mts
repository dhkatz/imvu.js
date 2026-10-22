import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Load IMVU_USERNAME/IMVU_PASSWORD etc. from .env when present (Node's built-in
// loader; existing env vars win). Test workers inherit this process's env.
try {
  process.loadEnvFile();
} catch {
  // No .env file — live tests stay skipped unless env vars are set some other way.
}

export default defineConfig({
  resolve: {
    alias: {
      // Resolve the workspace package to source so tests don't need a build.
      '@imvu/rest': fileURLToPath(new URL('./packages/rest/src/index.ts', import.meta.url)),
      '@imvu/imq': fileURLToPath(new URL('./packages/imq/src/index.ts', import.meta.url)),
      '@imvu/xmlrpc': fileURLToPath(new URL('./packages/xmlrpc/src/index.ts', import.meta.url)),
      '@imvu/cal3d': fileURLToPath(new URL('./packages/cal3d/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // Existing tests use describe/it/expect/beforeAll/afterAll as globals.
    globals: true,
    environment: 'node',
    include: ['packages/*/test/**/*.test.ts'],
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
