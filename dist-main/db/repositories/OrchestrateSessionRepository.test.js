"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const OrchestrateSessionRepository_1 = require("./OrchestrateSessionRepository");
const connection_1 = __importDefault(require("../connection"));
// Schema migration + per-test table wipe come from tests/setup.ts.
(0, vitest_1.describe)('OrchestrateSessionRepository', () => {
    (0, vitest_1.describe)('create', () => {
        (0, vitest_1.it)('returns a session with the correct id and title', () => {
            const session = OrchestrateSessionRepository_1.OrchestrateSessionRepository.create('sess-1', 'My Session');
            (0, vitest_1.expect)(session.id).toBe('sess-1');
            (0, vitest_1.expect)(session.title).toBe('My Session');
        });
        (0, vitest_1.it)('timestamps are non-empty strings', () => {
            const session = OrchestrateSessionRepository_1.OrchestrateSessionRepository.create('sess-2', 'TS Test');
            (0, vitest_1.expect)(typeof session.created_at).toBe('string');
            (0, vitest_1.expect)(session.created_at.length).toBeGreaterThan(0);
            (0, vitest_1.expect)(typeof session.updated_at).toBe('string');
            (0, vitest_1.expect)(session.updated_at.length).toBeGreaterThan(0);
        });
    });
    (0, vitest_1.describe)('list', () => {
        (0, vitest_1.it)('returns empty array when no sessions exist', () => {
            (0, vitest_1.expect)(OrchestrateSessionRepository_1.OrchestrateSessionRepository.list()).toEqual([]);
        });
        (0, vitest_1.it)('returns sessions ordered newest-first by updated_at', () => {
            // Force different updated_at by manipulating the row directly after insert.
            OrchestrateSessionRepository_1.OrchestrateSessionRepository.create('old-sess', 'Older');
            connection_1.default.prepare(`UPDATE orchestrate_sessions SET updated_at = '2020-01-01 00:00:00' WHERE id = 'old-sess'`).run();
            OrchestrateSessionRepository_1.OrchestrateSessionRepository.create('new-sess', 'Newer');
            connection_1.default.prepare(`UPDATE orchestrate_sessions SET updated_at = '2025-01-01 00:00:00' WHERE id = 'new-sess'`).run();
            const sessions = OrchestrateSessionRepository_1.OrchestrateSessionRepository.list();
            (0, vitest_1.expect)(sessions[0].id).toBe('new-sess');
            (0, vitest_1.expect)(sessions[1].id).toBe('old-sess');
        });
        (0, vitest_1.it)('respects the limit parameter', () => {
            for (let i = 0; i < 5; i++) {
                OrchestrateSessionRepository_1.OrchestrateSessionRepository.create(`limit-sess-${i}`, `Session ${i}`);
            }
            (0, vitest_1.expect)(OrchestrateSessionRepository_1.OrchestrateSessionRepository.list(3)).toHaveLength(3);
        });
    });
    (0, vitest_1.describe)('findById', () => {
        (0, vitest_1.it)('returns the session for a known id', () => {
            OrchestrateSessionRepository_1.OrchestrateSessionRepository.create('find-me', 'Findable');
            const session = OrchestrateSessionRepository_1.OrchestrateSessionRepository.findById('find-me');
            (0, vitest_1.expect)(session).not.toBeNull();
            (0, vitest_1.expect)(session.id).toBe('find-me');
            (0, vitest_1.expect)(session.title).toBe('Findable');
        });
        (0, vitest_1.it)('returns null for an unknown id', () => {
            (0, vitest_1.expect)(OrchestrateSessionRepository_1.OrchestrateSessionRepository.findById('ghost')).toBeNull();
        });
    });
    (0, vitest_1.describe)('touch', () => {
        (0, vitest_1.it)('updates updated_at without throwing', () => {
            OrchestrateSessionRepository_1.OrchestrateSessionRepository.create('touch-me', 'Touch Test');
            connection_1.default.prepare(`UPDATE orchestrate_sessions SET updated_at = '2020-01-01 00:00:00' WHERE id = 'touch-me'`).run();
            (0, vitest_1.expect)(() => OrchestrateSessionRepository_1.OrchestrateSessionRepository.touch('touch-me')).not.toThrow();
            const after = OrchestrateSessionRepository_1.OrchestrateSessionRepository.findById('touch-me');
            (0, vitest_1.expect)(after.updated_at).not.toBe('2020-01-01 00:00:00');
        });
    });
    (0, vitest_1.describe)('delete', () => {
        (0, vitest_1.it)('removes the session so findById returns null', () => {
            OrchestrateSessionRepository_1.OrchestrateSessionRepository.create('delete-me', 'Gone');
            OrchestrateSessionRepository_1.OrchestrateSessionRepository.delete('delete-me');
            (0, vitest_1.expect)(OrchestrateSessionRepository_1.OrchestrateSessionRepository.findById('delete-me')).toBeNull();
        });
        (0, vitest_1.it)('is a no-op for an unknown id and does not throw', () => {
            (0, vitest_1.expect)(() => OrchestrateSessionRepository_1.OrchestrateSessionRepository.delete('does-not-exist')).not.toThrow();
        });
    });
});
