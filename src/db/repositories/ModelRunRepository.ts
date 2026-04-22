import db from '../connection';
import { ModelRun, assertVerificationState } from '../../shared/types';

export const ModelRunRepository = {
  create: (run: Partial<ModelRun> & { id: string; model_id: string; prompt: string }) => {
    const stmt = db.prepare(`
      INSERT INTO model_runs (id, session_id, model_id, prompt, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(run.id, run.session_id || null, run.model_id, run.prompt, run.status || 'queued');
  },

  list: (limit = 100): ModelRun[] => {
    return db.prepare('SELECT * FROM model_runs ORDER BY created_at DESC LIMIT ?').all(limit) as ModelRun[];
  },

  update: (id: string, updates: Partial<ModelRun>) => {
    if (updates.verification_state !== undefined) {
      assertVerificationState(updates.verification_state);
    }
    const keys = Object.keys(updates).filter(k => k !== 'id');
    if (keys.length === 0) return;

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => (updates as any)[k]);

    db.prepare(`UPDATE model_runs SET ${setClause} WHERE id = ?`)
      .run(...values, id);
  }
};
