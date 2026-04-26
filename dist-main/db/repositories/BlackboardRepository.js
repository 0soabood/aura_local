"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlackboardRepository = void 0;
const connection_1 = __importDefault(require("../connection"));
exports.BlackboardRepository = {
    /**
     * Upsert a key within a session.
     * ON CONFLICT(session_id, key) replaces the row and resets consumed_count.
     */
    publish(sessionId, key, value, // pre-serialised JSON
    publishedBy, expiresAt = null) {
        connection_1.default.prepare(`
      INSERT INTO blackboard (session_id, key, value, published_by, expires_at, consumed_count)
      VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT(session_id, key) DO UPDATE SET
        value         = excluded.value,
        published_by  = excluded.published_by,
        published_at  = CURRENT_TIMESTAMP,
        expires_at    = excluded.expires_at,
        consumed_count = 0
    `).run(sessionId, key, value, publishedBy, expiresAt);
    },
    /**
     * Fetch all live (non-expired) entries for a session, ordered oldest-first
     * so later updates win when callers reduce into an object.
     */
    findBySession(sessionId) {
        return connection_1.default.prepare(`
      SELECT * FROM blackboard
      WHERE session_id = ?
        AND (expires_at IS NULL OR julianday(expires_at) > julianday('now'))
      ORDER BY published_at ASC
    `).all(sessionId);
    },
    /** Bulk-increment consumed_count for a list of row IDs */
    markConsumed(ids) {
        if (ids.length === 0)
            return;
        const placeholders = ids.map(() => '?').join(',');
        connection_1.default.prepare(`UPDATE blackboard SET consumed_count = consumed_count + 1 WHERE id IN (${placeholders})`).run(...ids);
    },
    /** Delete expired entries (call periodically from the server) */
    purgeExpired() {
        const info = connection_1.default.prepare(`DELETE FROM blackboard WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`).run();
        return info.changes;
    },
};
