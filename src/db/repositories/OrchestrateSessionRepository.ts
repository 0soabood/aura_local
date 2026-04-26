import db from '../connection';

export interface OrchestrateSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export const OrchestrateSessionRepository = {
  create(id: string, title: string): OrchestrateSession {
    db.prepare(
      `INSERT INTO orchestrate_sessions (id, title) VALUES (?, ?)`,
    ).run(id, title);
    return db.prepare(
      `SELECT * FROM orchestrate_sessions WHERE id = ?`,
    ).get(id) as OrchestrateSession;
  },

  list(limit = 50): OrchestrateSession[] {
    return db.prepare(
      `SELECT * FROM orchestrate_sessions ORDER BY updated_at DESC LIMIT ?`,
    ).all(limit) as OrchestrateSession[];
  },

  findById(id: string): OrchestrateSession | null {
    return (db.prepare(
      `SELECT * FROM orchestrate_sessions WHERE id = ?`,
    ).get(id) as OrchestrateSession | null) ?? null;
  },

  touch(id: string): void {
    db.prepare(
      `UPDATE orchestrate_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(id);
  },

  delete(id: string): void {
    db.prepare(`DELETE FROM orchestrate_sessions WHERE id = ?`).run(id);
  },
};
