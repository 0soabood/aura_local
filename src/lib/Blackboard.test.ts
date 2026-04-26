import { describe, it, expect, beforeEach } from 'vitest';
import { Blackboard } from './Blackboard';
import { BlackboardRepository } from '../db/repositories/BlackboardRepository';
import db from '../db/connection';

// The test DB is :memory: (set by vitest.config.ts → tests/setup.ts).
// We still need the schema so the blackboard table exists.
import { schema } from '../db/index';

beforeEach(() => {
  schema.up();
  // Purge all blackboard rows between tests for isolation
  db.prepare('DELETE FROM blackboard').run();
});

describe('Blackboard', () => {
  const bb = new Blackboard();

  it('publishes and retrieves a key within a session', () => {
    bb.publish('sess-a', 'market_summary', { trend: 'bullish' }, 'gemini:gemini-2.5-flash');
    const ctx = bb.getContext('sess-a');
    expect(ctx['market_summary']).toEqual({ trend: 'bullish' });
  });

  it('session isolation — keys do not leak across sessions', () => {
    bb.publish('sess-a', 'shared_key', 'value-a', 'gemini:gemini-2.5-flash');
    bb.publish('sess-b', 'shared_key', 'value-b', 'groq:llama-3.3-70b-versatile');

    expect(bb.getContext('sess-a')['shared_key']).toBe('value-a');
    expect(bb.getContext('sess-b')['shared_key']).toBe('value-b');
  });

  it('upserts — later publish overwrites earlier value for same session+key', () => {
    bb.publish('sess-c', 'k', 'v1', 'model-a');
    bb.publish('sess-c', 'k', 'v2', 'model-b');
    expect(bb.getContext('sess-c')['k']).toBe('v2');
  });

  it('increments consumed_count on each getContext call', () => {
    bb.publish('sess-d', 'counter_key', 42, 'model-a');

    bb.getContext('sess-d');
    bb.getContext('sess-d');

    const entries = BlackboardRepository.findBySession('sess-d');
    expect(entries[0].consumed_count).toBe(2);
  });

  it('publishes multiple keys atomically via publishMany', () => {
    bb.publishMany('sess-e', { a: 1, b: 2, c: 3 }, 'model-a');
    const ctx = bb.getContext('sess-e');
    expect(ctx['a']).toBe(1);
    expect(ctx['b']).toBe(2);
    expect(ctx['c']).toBe(3);
  });

  it('respects TTL — expired entries are not returned', () => {
    // Publish with TTL=-1s (already expired)
    BlackboardRepository.publish(
      'sess-f', 'old_key', '"stale"', 'model-a',
      new Date(Date.now() - 1000).toISOString(),
    );
    const ctx = bb.getContext('sess-f');
    expect(ctx['old_key']).toBeUndefined();
  });

  it('non-expired entries are still returned', () => {
    bb.publish('sess-g', 'fresh_key', 'fresh', 'model-a', 3600);
    const ctx = bb.getContext('sess-g');
    expect(ctx['fresh_key']).toBe('fresh');
  });
});
