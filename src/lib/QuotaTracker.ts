import db from '../db/connection';

class PersistentQuotaTracker {
  constructor() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS model_quotas (
        role TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        date TEXT NOT NULL
      )
    `);
  }

  canUse(role: string, dailyQuota: number): boolean {
    const today = new Date().toISOString().split('T')[0];
    const row = db.prepare('SELECT count, date FROM model_quotas WHERE role = ?').get(role) as
      | { count: number; date: string }
      | undefined;

    if (!row || row.date !== today) {
      db.prepare('INSERT OR REPLACE INTO model_quotas (role, count, date) VALUES (?, 0, ?)').run(role, today);
      return dailyQuota > 0;
    }

    return row.count < dailyQuota;
  }

  record(role: string): void {
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT INTO model_quotas (role, count, date) VALUES (?, 1, ?)
      ON CONFLICT(role) DO UPDATE SET
        count = CASE WHEN date = excluded.date THEN count + 1 ELSE 1 END,
        date = excluded.date
    `).run(role, today);
  }
}

export const quotaTracker = new PersistentQuotaTracker();