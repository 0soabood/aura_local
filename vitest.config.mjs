import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    env: { AURA_DB_PATH: ':memory:' },
    isolate: true,
    include: ['src/**/*.test.ts'],
  },
});
