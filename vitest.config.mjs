import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    env: { 
      AURA_DB_PATH: ':memory:',
      NODE_ENV: 'development',  // Bypass auth middleware in tests
    },
    isolate: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // Mock better-sqlite3 for Windows compatibility
    alias: {
      'better-sqlite3': __dirname + '/__mocks__/better-sqlite3.js',
    },
  },
});
