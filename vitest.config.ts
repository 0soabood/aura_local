import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom for component tests (VerificationBadge etc.); node-ish APIs
    // (better-sqlite3, crypto.randomUUID) work fine inside jsdom too.
    environment: 'jsdom',
    globals: false,
    // Loaded BEFORE each test file's imports resolve, so AURA_DB_PATH is in
    // place by the time src/db/connection.ts opens its singleton.
    setupFiles: ['./tests/setup.ts'],
    env: {
      AURA_DB_PATH: ':memory:',
      NODE_ENV: 'development',  // Bypass auth middleware in tests
    },
    // Repository tests share a single in-memory DB per worker; isolate keeps
    // suites from leaking schema state across files.
    isolate: true,
    exclude: ['**/node_modules/**', '**/dist-main/**', '**/dist/**', '**/better-sqlite3/**'],
  },
});
