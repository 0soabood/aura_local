import db from '../connection';
import { RoadmapItem, WorkflowStatus, assertVerificationState } from '../../shared/types';

export interface IRoadmapRepository {
  create(item: Partial<RoadmapItem> & { id: string; title: string }): void;
  list(status?: WorkflowStatus): RoadmapItem[];
  update(id: string, updates: Partial<RoadmapItem>): void;
  delete(id: string): void;
}

export const RoadmapRepository: IRoadmapRepository = {
  create: (item) => {
    const stmt = db.prepare(`
      INSERT INTO roadmap_items (id, title, description, priority, roi_score, lane, status, due_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      item.id, 
      item.title, 
      item.description || null, 
      item.priority || 0, 
      item.roi_score || 0, 
      item.lane || 'general', 
      item.status || 'todo', 
      item.due_at || null
    );
  },

  list: (status) => {
    if (status) {
      return db.prepare('SELECT * FROM roadmap_items WHERE status = ? ORDER BY priority DESC, roi_score DESC').all(status) as RoadmapItem[];
    }
    return db.prepare('SELECT * FROM roadmap_items ORDER BY priority DESC, roi_score DESC').all() as RoadmapItem[];
  },

  update: (id, updates) => {
    if (updates.verification_state !== undefined) {
      assertVerificationState(updates.verification_state);
    }
    const keys = Object.keys(updates).filter(k => k !== 'id');
    if (keys.length === 0) return;

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => (updates as any)[k]);

    db.prepare(`UPDATE roadmap_items SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...values, id);
  },

  delete: (id) => {
    db.prepare('DELETE FROM roadmap_items WHERE id = ?').run(id);
  }
};
