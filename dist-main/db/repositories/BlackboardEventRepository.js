"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlackboardEventRepository = void 0;
const connection_1 = __importDefault(require("../connection"));
exports.BlackboardEventRepository = {
    /**
     * Append a new event. seq is computed inside a serialisable transaction so
     * no two concurrent appends for the same session can get the same sequence
     * number (better-sqlite3 is synchronous — no actual concurrency risk in
     * practice, but the UNIQUE(session_id, seq) constraint guards it anyway).
     */
    append(sessionId, eventType, author, content, metadata) {
        return (connection_1.default.transaction(() => {
            const { next_seq } = connection_1.default.prepare(`SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
           FROM blackboard_events
          WHERE session_id = ?`).get(sessionId);
            connection_1.default.prepare(`INSERT INTO blackboard_events (session_id, seq, event_type, author, content, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`).run(sessionId, next_seq, eventType, author, content, metadata !== undefined ? JSON.stringify(metadata) : null);
            return connection_1.default.prepare(`SELECT * FROM blackboard_events WHERE session_id = ? AND seq = ?`).get(sessionId, next_seq);
        }))();
    },
    /** All events for a session, oldest-first. */
    findBySession(sessionId) {
        return connection_1.default.prepare(`SELECT * FROM blackboard_events
        WHERE session_id = ?
        ORDER BY seq ASC`).all(sessionId);
    },
    /** The most-recent event for a session, or null if the session is empty. */
    lastEvent(sessionId) {
        return connection_1.default.prepare(`SELECT * FROM blackboard_events
        WHERE session_id = ?
        ORDER BY seq DESC
        LIMIT 1`).get(sessionId) ?? null;
    },
    /** Delete all events for a session. */
    deleteSession(sessionId) {
        connection_1.default.prepare(`DELETE FROM blackboard_events WHERE session_id = ?`).run(sessionId);
    },
};
