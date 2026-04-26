"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Blackboard = void 0;
const BlackboardRepository_1 = require("../db/repositories/BlackboardRepository");
const connection_1 = require("../db/connection");
/**
 * Blackboard — shared context store for multi-model supervisor runs.
 *
 * Keys are session-scoped, so parallel sessions never collide.
 * Calling getContext() atomically increments consumed_count on every
 * returned row, making utilisation trivially measurable.
 */
class Blackboard {
    /**
     * Publish (or overwrite) a key in the session namespace.
     *
     * @param sessionId   Owning session
     * @param key         Domain-meaningful key, e.g. "research_summary"
     * @param value       Any JSON-serialisable value
     * @param publishedBy Routing string of the publishing model, e.g. "gemini:gemini-2.5-flash"
     * @param ttlSeconds  Optional TTL; omit for persistent entries
     */
    publish(sessionId, key, value, publishedBy, ttlSeconds) {
        const expiresAt = ttlSeconds
            ? new Date(Date.now() + ttlSeconds * 1_000).toISOString()
            : null;
        BlackboardRepository_1.BlackboardRepository.publish(sessionId, key, JSON.stringify(value), publishedBy, expiresAt);
    }
    /**
     * Retrieve the full context for a session as a plain object.
     * Increments consumed_count on all returned rows.
     */
    getContext(sessionId) {
        const entries = (0, connection_1.runTransaction)(() => {
            const rows = BlackboardRepository_1.BlackboardRepository.findBySession(sessionId);
            if (rows.length > 0) {
                BlackboardRepository_1.BlackboardRepository.markConsumed(rows.map(e => e.id));
            }
            return rows;
        });
        return entries.reduce((acc, entry) => {
            try {
                acc[entry.key] = JSON.parse(entry.value);
            }
            catch {
                acc[entry.key] = entry.value; // fallback: store raw string
            }
            return acc;
        }, {});
    }
    /** Publish multiple keys in one call */
    publishMany(sessionId, updates, publishedBy, ttlSeconds) {
        for (const [key, value] of Object.entries(updates)) {
            this.publish(sessionId, key, value, publishedBy, ttlSeconds);
        }
    }
}
exports.Blackboard = Blackboard;
