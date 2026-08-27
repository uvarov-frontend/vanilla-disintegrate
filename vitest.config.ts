import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __VANILLA_DISINTEGRATE_MODULE_URL__: '"http://localhost/src/index.ts"',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
  },
});
