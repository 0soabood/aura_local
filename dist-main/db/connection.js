"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTransaction = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
/**
 * DB connection.
 *
 * In production / dev the DB lives at <cwd>/aura.db.
 * Tests override via AURA_DB_PATH (typically ':memory:'); this is set
 * by vitest.config.ts -> tests/setup.ts before any module imports run.
 */
const dbPath = process.env.AURA_DB_PATH ?? path_1.default.join(process.cwd(), 'aura.db');
const db = new better_sqlite3_1.default(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
exports.default = db;
/**
 * Helper for atomic operations
 */
const runTransaction = (fn) => {
    return db.transaction(fn)();
};
exports.runTransaction = runTransaction;
