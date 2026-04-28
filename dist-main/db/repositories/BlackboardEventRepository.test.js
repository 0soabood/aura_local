"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const BlackboardEventRepository_1 = require("./BlackboardEventRepository");
// Schema migration + per-test table wipe come from tests/setup.ts.
(0, vitest_1.describe)('BlackboardEventRepository', () => {
    (0, vitest_1.describe)('append', () => {
        (0, vitest_1.it)('first event gets seq=1 and all fields round-trip', () => {
            const event = BlackboardEventRepository_1.BlackboardEventRepository.append('session-a', 'user_message', 'user', 'Hello');
            (0, vitest_1.expect)(event.seq).toBe(1);
            (0, vitest_1.expect)(event.session_id).toBe('session-a');
            (0, vitest_1.expect)(event.event_type).toBe('user_message');
            (0, vitest_1.expect)(event.author).toBe('user');
            (0, vitest_1.expect)(event.content).toBe('Hello');
        });
        (0, vitest_1.it)('seq increments within the same session', () => {
            const e1 = BlackboardEventRepository_1.BlackboardEventRepository.append('session-b', 'user_message', 'user', 'first');
            const e2 = BlackboardEventRepository_1.BlackboardEventRepository.append('session-b', 'agent_output', 'research_agent', 'second');
            (0, vitest_1.expect)(e1.seq).toBe(1);
            (0, vitest_1.expect)(e2.seq).toBe(2);
        });
        (0, vitest_1.it)('seq restarts at 1 for a different session', () => {
            BlackboardEventRepository_1.BlackboardEventRepository.append('session-c', 'user_message', 'user', 'msg');
            const e = BlackboardEventRepository_1.BlackboardEventRepository.append('session-d', 'user_message', 'user', 'msg');
            (0, vitest_1.expect)(e.seq).toBe(1);
        });
        (0, vitest_1.it)('serialises metadata to a JSON string', () => {
            const meta = { confidence: 0.9, latency_ms: 120 };
            const event = BlackboardEventRepository_1.BlackboardEventRepository.append('session-e', 'agent_output', 'research_agent', 'content', meta);
            (0, vitest_1.expect)(event.metadata).toBe(JSON.stringify(meta));
        });
        (0, vitest_1.it)('metadata is null when omitted', () => {
            const event = BlackboardEventRepository_1.BlackboardEventRepository.append('session-f', 'user_message', 'user', 'hi');
            (0, vitest_1.expect)(event.metadata).toBeNull();
        });
    });
    (0, vitest_1.describe)('findBySession', () => {
        (0, vitest_1.it)('returns events ordered ASC by seq', () => {
            BlackboardEventRepository_1.BlackboardEventRepository.append('session-g', 'user_message', 'user', 'a');
            BlackboardEventRepository_1.BlackboardEventRepository.append('session-g', 'agent_output', 'research_agent', 'b');
            BlackboardEventRepository_1.BlackboardEventRepository.append('session-g', 'synthesis_complete', 'synthesis_agent', 'c');
            const events = BlackboardEventRepository_1.BlackboardEventRepository.findBySession('session-g');
            (0, vitest_1.expect)(events).toHaveLength(3);
            (0, vitest_1.expect)(events.map(e => e.seq)).toEqual([1, 2, 3]);
            (0, vitest_1.expect)(events.map(e => e.content)).toEqual(['a', 'b', 'c']);
        });
        (0, vitest_1.it)('returns empty array for an unknown session', () => {
            const events = BlackboardEventRepository_1.BlackboardEventRepository.findBySession('does-not-exist');
            (0, vitest_1.expect)(events).toEqual([]);
        });
    });
    (0, vitest_1.describe)('lastEvent', () => {
        (0, vitest_1.it)('returns the most recent event by seq', () => {
            BlackboardEventRepository_1.BlackboardEventRepository.append('session-h', 'user_message', 'user', 'first');
            BlackboardEventRepository_1.BlackboardEventRepository.append('session-h', 'agent_output', 'code_agent', 'second');
            BlackboardEventRepository_1.BlackboardEventRepository.append('session-h', 'synthesis_complete', 'synthesis_agent', 'third');
            const last = BlackboardEventRepository_1.BlackboardEventRepository.lastEvent('session-h');
            (0, vitest_1.expect)(last).not.toBeNull();
            (0, vitest_1.expect)(last.seq).toBe(3);
            (0, vitest_1.expect)(last.content).toBe('third');
        });
        (0, vitest_1.it)('returns null for an empty session', () => {
            (0, vitest_1.expect)(BlackboardEventRepository_1.BlackboardEventRepository.lastEvent('empty-session')).toBeNull();
        });
    });
    (0, vitest_1.describe)('deleteSession', () => {
        (0, vitest_1.it)('removes only the target session, leaving others intact', () => {
            BlackboardEventRepository_1.BlackboardEventRepository.append('session-i', 'user_message', 'user', 'i-msg');
            BlackboardEventRepository_1.BlackboardEventRepository.append('session-j', 'user_message', 'user', 'j-msg');
            BlackboardEventRepository_1.BlackboardEventRepository.deleteSession('session-i');
            (0, vitest_1.expect)(BlackboardEventRepository_1.BlackboardEventRepository.findBySession('session-i')).toHaveLength(0);
            (0, vitest_1.expect)(BlackboardEventRepository_1.BlackboardEventRepository.findBySession('session-j')).toHaveLength(1);
        });
    });
});
