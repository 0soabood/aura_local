/**
 * Vitest setup. Runs once per test file, BEFORE the test file's own imports
 * resolve, because vitest hoists setupFiles ahead of the test module graph.
 *
 * Responsibilities:
 *   1. Force the DB connection to use an in-memory SQLite (via AURA_DB_PATH,
 *      which connection.ts reads at module-load time). vitest.config.ts also
 *      sets this through `test.env`, but we set it here defensively in case
 *      this file is reused outside that config.
 *   2. Apply the schema migrations against that fresh in-memory DB.
 *   3. Wipe all tables before each test, so suites stay independent.
 */
process.env.AURA_DB_PATH = process.env.AURA_DB_PATH ?? ':memory:';

import { beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import db from '../src/db/connection';
import { schema } from '../src/db';

schema.up();

// Without vitest `globals: true`, @testing-library/react's auto-cleanup
// doesn't fire — leftover renders accumulate and break getByText() with
// "Found multiple elements". Run cleanup explicitly after each test.
afterEach(() => {
  cleanup();
});

beforeEach(() => {
  // Order matters only if you have FKs; ours all use ON DELETE SET NULL or
  // are independent, so straight DELETEs are safe.
  db.exec(`
    DELETE FROM research_snippets;
    DELETE FROM model_runs;
    DELETE FROM roadmap_items;
    DELETE FROM roi_events;
    DELETE FROM system_logs;
    DELETE FROM research_sessions;
    DELETE FROM settings;
    DELETE FROM blackboard_events;
    DELETE FROM orchestrate_sessions;
  `);
});
