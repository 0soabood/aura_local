import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'aura.db');
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
