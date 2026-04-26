import db from '../connection';
import { BlackboardEvent, EventType, AgentName } from '../../shared/types';

export const BlackboardEventRepository = {
  /**
   * Append a new event. seq is computed inside a serialisable transaction so
   * no two concurrent appends for the same session can get the same sequence
   * number (better-sqlite3 is synchronous — no actual concurrency risk in
   * practice, but the UNIQUE(session_id, seq) constraint guards it anyway).
   */
  append(
    sessionId: string,
    eventType: EventType,
    author: AgentName | 'user',
    content: string,
    metadata?: Record<string, unknown>,
  ): BlackboardEvent {
    return (db.transaction(() => {
      const { next_seq } = db.prepare(
        `SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
           FROM blackboard_events
          WHERE session_id = ?`,
      ).get(sessionId) as { next_seq: number };

      db.prepare(
        `INSERT INTO blackboard_events (session_id, seq, event_type, author, content, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        sessionId,
        next_seq,
        eventType,
        author,
        content,
        metadata !== undefined ? JSON.stringify(metadata) : null,
      );

      return db.prepare(
        `SELECT * FROM blackboard_events WHERE session_id = ? AND seq = ?`,
      ).get(sessionId, next_seq) as BlackboardEvent;
    }))();
  },

  /** All events for a session, oldest-first. */
  findBySession(sessionId: string): BlackboardEvent[] {
    return db.prepare(
      `SELECT * FROM blackboard_events
        WHERE session_id = ?
        ORDER BY seq ASC`,
    ).all(sessionId) as BlackboardEvent[];
  },

  /** The most-recent event for a session, or null if the session is empty. */
  lastEvent(sessionId: string): BlackboardEvent | null {
    return (db.prepare(
      `SELECT * FROM blackboard_events
        WHERE session_id = ?
        ORDER BY seq DESC
        LIMIT 1`,
    ).get(sessionId) as BlackboardEvent | null) ?? null;
  },

  /** Delete all events for a session. */
  deleteSession(sessionId: string): void {
    db.prepare(`DELETE FROM blackboard_events WHERE session_id = ?`).run(sessionId);
  },
};
