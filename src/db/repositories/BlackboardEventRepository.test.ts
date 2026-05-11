import { describe, it, expect } from 'vitest';
import { BlackboardEventRepository } from './BlackboardEventRepository';

// Schema migration + per-test table wipe come from tests/setup.ts.

describe('BlackboardEventRepository', () => {
  describe('append', () => {
    it('first event gets seq=1 and all fields round-trip', () => {
      const event = BlackboardEventRepository.append(
        'session-a',
        'user_message',
        'user',
        'Hello',
      );
      expect(event.seq).toBe(1);
      expect(event.session_id).toBe('session-a');
      expect(event.event_type).toBe('user_message');
      expect(event.author).toBe('user');
      expect(event.content).toBe('Hello');
    });

    it('seq increments within the same session', () => {
      const e1 = BlackboardEventRepository.append('session-b', 'user_message', 'user', 'first');
      const e2 = BlackboardEventRepository.append('session-b', 'agent_output', 'research_agent', 'second');
      expect(e1.seq).toBe(1);
      expect(e2.seq).toBe(2);
    });

    it('seq restarts at 1 for a different session', () => {
      BlackboardEventRepository.append('session-c', 'user_message', 'user', 'msg');
      const e = BlackboardEventRepository.append('session-d', 'user_message', 'user', 'msg');
      expect(e.seq).toBe(1);
    });

    it('serialises metadata to a JSON string', () => {
      const meta = { confidence: 0.9, latency_ms: 120 };
      const event = BlackboardEventRepository.append(
        'session-e',
        'agent_output',
        'research_agent',
        'content',
        meta,
      );
      expect(event.metadata).toBe(JSON.stringify(meta));
    });

    it('metadata is null when omitted', () => {
      const event = BlackboardEventRepository.append('session-f', 'user_message', 'user', 'hi');
      expect(event.metadata).toBeNull();
    });
  });

  describe('findBySession', () => {
    it('returns events ordered ASC by seq', () => {
      BlackboardEventRepository.append('session-g', 'user_message', 'user', 'a');
      BlackboardEventRepository.append('session-g', 'agent_output', 'research_agent', 'b');
      BlackboardEventRepository.append('session-g', 'synthesis_complete', 'synthesis_agent', 'c');

      const events = BlackboardEventRepository.findBySession('session-g');
      expect(events).toHaveLength(3);
      expect(events.map(e => e.seq)).toEqual([1, 2, 3]);
      expect(events.map(e => e.content)).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for an unknown session', () => {
      const events = BlackboardEventRepository.findBySession('does-not-exist');
      expect(events).toEqual([]);
    });
  });

  describe('lastEvent', () => {
    it('returns the most recent event by seq', () => {
      BlackboardEventRepository.append('session-h', 'user_message', 'user', 'first');
      BlackboardEventRepository.append('session-h', 'agent_output', 'code_agent', 'second');
      BlackboardEventRepository.append('session-h', 'synthesis_complete', 'synthesis_agent', 'third');

      const last = BlackboardEventRepository.lastEvent('session-h');
      expect(last).not.toBeNull();
      expect(last!.seq).toBe(3);
      expect(last!.content).toBe('third');
    });

    it('returns null for an empty session', () => {
      expect(BlackboardEventRepository.lastEvent('empty-session')).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('removes only the target session, leaving others intact', () => {
      BlackboardEventRepository.append('session-i', 'user_message', 'user', 'i-msg');
      BlackboardEventRepository.append('session-j', 'user_message', 'user', 'j-msg');

      BlackboardEventRepository.deleteSession('session-i');

      expect(BlackboardEventRepository.findBySession('session-i')).toHaveLength(0);
      expect(BlackboardEventRepository.findBySession('session-j')).toHaveLength(1);
    });
  });
});
