/**
 * Migration Idempotence Tests
 * 
 * Verifies that schema.up() can be called multiple times without errors
 * and results in the same schema state (idempotent migrations).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock better-sqlite3 before any imports that use it
vi.mock('better-sqlite3', () => {
  const mockDb = {
    prepare: () => ({
      run: () => ({ changes: 0, lastInsertRowid: 1 }),
      get: () => undefined,
      all: () => [],
      iterate: () => ({ next: () => ({ done: true }) }),
      bind: function() { return this; },
    }),
    pragma: () => '',
    transaction: (fn) => (...args) => fn(...args),
    exec: () => {},
    close: () => {},
  };
  
  return {
    default: class Database {
      constructor() { return mockDb; }
    }
  };
});

import db from '../src/db/connection';
import { schema } from '../src/db';

describe('Migration Idempotence', () => {
  beforeAll(() => {
    // Ensure schema is applied initially
    schema.up();
  });

  it('should not throw when calling schema.up() multiple times', () => {
    // Call schema.up() multiple times - should not throw
    expect(() => schema.up()).not.toThrow();
    expect(() => schema.up()).not.toThrow();
    expect(() => schema.up()).not.toThrow();
  });

  it('should have all expected tables after multiple schema.up() calls', () => {
    // Call schema.up() again to verify idempotence
    schema.up();

    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all() as { name: string }[];

    const tableNames = tables.map(t => t.name);

    // Verify all expected tables exist
    expect(tableNames).toContain('settings');
    expect(tableNames).toContain('research_sessions');
    expect(tableNames).toContain('research_snippets');
    expect(tableNames).toContain('model_runs');
    expect(tableNames).toContain('roadmap_items');
    expect(tableNames).toContain('roi_events');
    expect(tableNames).toContain('system_logs');
    expect(tableNames).toContain('blackboard');
    expect(tableNames).toContain('supervisor_stats');
    expect(tableNames).toContain('blackboard_events');
    expect(tableNames).toContain('orchestrate_sessions');
  });

  it('should have correct columns in blackboard_events after multiple migrations', () => {
    // Call schema.up() again
    schema.up();

    const tableInfo = db.prepare(`PRAGMA table_info(blackboard_events)`).all() as {
      name: string;
      type: string;
      notnull: number;
    }[];

    const columnNames = tableInfo.map(col => col.name);

    // Verify all expected columns exist
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('session_id');
    expect(columnNames).toContain('seq');
    expect(columnNames).toContain('event_type');
    expect(columnNames).toContain('author');
    expect(columnNames).toContain('content');
    expect(columnNames).toContain('metadata');
    expect(columnNames).toContain('created_at');
  });

  it('should have correct CHECK constraint on blackboard_events event_type', () => {
    // Call schema.up() again
    schema.up();

    const tableInfo = db.prepare(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='blackboard_events'`
    ).get() as { sql: string };

    // Verify the CHECK constraint includes all expected event types
    expect(tableInfo.sql).toContain('user_message');
    expect(tableInfo.sql).toContain('agent_output');
    expect(tableInfo.sql).toContain('execution_error');
    expect(tableInfo.sql).toContain('synthesis_complete');
    expect(tableInfo.sql).toContain('escalation_required');
    expect(tableInfo.sql).toContain('code_context_retrieved');
    expect(tableInfo.sql).toContain('code_written');
  });

  it('should have all expected columns in model_runs after migrations', () => {
    schema.up();

    const tableInfo = db.prepare(`PRAGMA table_info(model_runs)`).all() as {
      name: string;
      type: string;
    }[];

    const columnNames = tableInfo.map(col => col.name);

    // Verify migrated columns exist
    expect(columnNames).toContain('session_id');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('verification_reasoning');
    expect(columnNames).toContain('supervisor');
    expect(columnNames).toContain('domain');
    expect(columnNames).toContain('escalation_reason');
  });

  it('should have all expected columns in research_snippets after migrations', () => {
    schema.up();

    const tableInfo = db.prepare(`PRAGMA table_info(research_snippets)`).all() as {
      name: string;
      type: string;
    }[];

    const columnNames = tableInfo.map(col => col.name);

    // Verify migrated columns exist
    expect(columnNames).toContain('session_id');
    expect(columnNames).toContain('verification_reasoning');
  });

  it('should maintain data integrity after multiple schema.up() calls', () => {
    // Insert test data
    db.prepare(
      `INSERT INTO research_snippets (id, title, content) VALUES (?, ?, ?)`
    ).run('test-1', 'Test Snippet', 'Test Content');

    // Call schema.up() multiple times
    schema.up();
    schema.up();

    // Verify data still exists
    const snippets = db.prepare(
      `SELECT * FROM research_snippets WHERE id = ?`
    ).all('test-1') as any[];

    expect(snippets.length).toBe(1);
    expect(snippets[0].title).toBe('Test Snippet');
  });
});
