import { describe, it, expect } from 'vitest';
import { OrchestrateSessionRepository } from './OrchestrateSessionRepository';
import db from '../connection';

// Schema migration + per-test table wipe come from tests/setup.ts.

describe('OrchestrateSessionRepository', () => {
  describe('create', () => {
    it('returns a session with the correct id and title', () => {
      const session = OrchestrateSessionRepository.create('sess-1', 'My Session');
      expect(session.id).toBe('sess-1');
      expect(session.title).toBe('My Session');
    });

    it('timestamps are non-empty strings', () => {
      const session = OrchestrateSessionRepository.create('sess-2', 'TS Test');
      expect(typeof session.created_at).toBe('string');
      expect(session.created_at.length).toBeGreaterThan(0);
      expect(typeof session.updated_at).toBe('string');
      expect(session.updated_at.length).toBeGreaterThan(0);
    });
  });

  describe('list', () => {
    it('returns empty array when no sessions exist', () => {
      expect(OrchestrateSessionRepository.list()).toEqual([]);
    });

    it('returns sessions ordered newest-first by updated_at', () => {
      // Force different updated_at by manipulating the row directly after insert.
      OrchestrateSessionRepository.create('old-sess', 'Older');
      db.prepare(
        `UPDATE orchestrate_sessions SET updated_at = '2020-01-01 00:00:00' WHERE id = 'old-sess'`,
      ).run();

      OrchestrateSessionRepository.create('new-sess', 'Newer');
      db.prepare(
        `UPDATE orchestrate_sessions SET updated_at = '2025-01-01 00:00:00' WHERE id = 'new-sess'`,
      ).run();

      const sessions = OrchestrateSessionRepository.list();
      expect(sessions[0].id).toBe('new-sess');
      expect(sessions[1].id).toBe('old-sess');
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        OrchestrateSessionRepository.create(`limit-sess-${i}`, `Session ${i}`);
      }
      expect(OrchestrateSessionRepository.list(3)).toHaveLength(3);
    });
  });

  describe('findById', () => {
    it('returns the session for a known id', () => {
      OrchestrateSessionRepository.create('find-me', 'Findable');
      const session = OrchestrateSessionRepository.findById('find-me');
      expect(session).not.toBeNull();
      expect(session!.id).toBe('find-me');
      expect(session!.title).toBe('Findable');
    });

    it('returns null for an unknown id', () => {
      expect(OrchestrateSessionRepository.findById('ghost')).toBeNull();
    });
  });

  describe('touch', () => {
    it('updates updated_at without throwing', () => {
      OrchestrateSessionRepository.create('touch-me', 'Touch Test');
      db.prepare(
        `UPDATE orchestrate_sessions SET updated_at = '2020-01-01 00:00:00' WHERE id = 'touch-me'`,
      ).run();

      expect(() => OrchestrateSessionRepository.touch('touch-me')).not.toThrow();

      const after = OrchestrateSessionRepository.findById('touch-me');
      expect(after!.updated_at).not.toBe('2020-01-01 00:00:00');
    });
  });

  describe('delete', () => {
    it('removes the session so findById returns null', () => {
      OrchestrateSessionRepository.create('delete-me', 'Gone');
      OrchestrateSessionRepository.delete('delete-me');
      expect(OrchestrateSessionRepository.findById('delete-me')).toBeNull();
    });

    it('is a no-op for an unknown id and does not throw', () => {
      expect(() => OrchestrateSessionRepository.delete('does-not-exist')).not.toThrow();
    });
  });
});
