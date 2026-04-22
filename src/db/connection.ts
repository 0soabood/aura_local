import Database from 'better-sqlite3';
import path from 'path';

/**
 * DB connection.
 *
 * In production / dev the DB lives at <cwd>/aura.db.
 * Tests override via AURA_DB_PATH (typically ':memory:'); this is set
 * by vitest.config.ts -> tests/setup.ts before any module imports run.
 */
const dbPath = process.env.AURA_DB_PATH ?? path.join(process.cwd(), 'aura.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;

/**
 * Helper for atomic operations
 */
export const runTransaction = (fn: () => any) => {
  return db.transaction(fn)();
};
