import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@context-tree/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@context-tree/jev': fileURLToPath(new URL('./packages/jev/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'benchmarks/**/*.test.ts'],
  },
});
