import { BlackboardRepository } from '../db/repositories/BlackboardRepository';
import { runTransaction } from '../db/connection';
import { BlackboardEntry } from '../shared/types';

/**
 * Blackboard — shared context store for multi-model supervisor runs.
 *
 * Keys are session-scoped, so parallel sessions never collide.
 * Calling getContext() atomically increments consumed_count on every
 * returned row, making utilisation trivially measurable.
 */
export class Blackboard {
  /**
   * Publish (or overwrite) a key in the session namespace.
   *
   * @param sessionId   Owning session
   * @param key         Domain-meaningful key, e.g. "research_summary"
   * @param value       Any JSON-serialisable value
   * @param publishedBy Routing string of the publishing model, e.g. "gemini:gemini-2.5-flash"
   * @param ttlSeconds  Optional TTL; omit for persistent entries
   */
  publish(
    sessionId: string,
    key: string,
    value: unknown,
    publishedBy: string,
    ttlSeconds?: number,
  ): void {
    const expiresAt = ttlSeconds
      ? new Date(Date.now() + ttlSeconds * 1_000).toISOString()
      : null;

    BlackboardRepository.publish(
      sessionId,
      key,
      JSON.stringify(value),
      publishedBy,
      expiresAt,
    );
  }

  /**
   * Retrieve the full context for a session as a plain object.
   * Increments consumed_count on all returned rows.
   */
  getContext(sessionId: string): Record<string, unknown> {
    const entries = runTransaction(() => {
      const rows = BlackboardRepository.findBySession(sessionId);
      if (rows.length > 0) {
        BlackboardRepository.markConsumed(rows.map(e => e.id));
      }
      return rows;
    }) as BlackboardEntry[];

    return entries.reduce<Record<string, unknown>>((acc, entry) => {
      try {
        acc[entry.key] = JSON.parse(entry.value);
      } catch {
        acc[entry.key] = entry.value; // fallback: store raw string
      }
      return acc;
    }, {});
  }

  /** Publish multiple keys in one call */
  publishMany(
    sessionId: string,
    updates: Record<string, unknown>,
    publishedBy: string,
    ttlSeconds?: number,
  ): void {
    for (const [key, value] of Object.entries(updates)) {
      this.publish(sessionId, key, value, publishedBy, ttlSeconds);
    }
  }
}
