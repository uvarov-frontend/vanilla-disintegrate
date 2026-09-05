import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        branches: 70,
        functions: 78,
        lines: 74,
        statements: 70,
      },
    },
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
