import db from '../connection';
import { SystemLog } from '../../shared/types';

export interface ISystemLogRepository {
  create(level: SystemLog['level'], module: string, message: string, payload?: any): void;
  list(limit?: number): SystemLog[];
  findById(id: number): SystemLog | null;
  delete(id: number): void;
}

export const SystemLogRepository: ISystemLogRepository = {
  create: (level, module, message, payload) => {
    const stmt = db.prepare(`
      INSERT INTO system_logs (level, module, message, payload)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(level, module, message, payload ? JSON.stringify(payload) : null);
  },

  list: (limit = 100) => {
    return db.prepare('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?').all(limit) as SystemLog[];
  },

  findById: (id) => {
    return db.prepare('SELECT * FROM system_logs WHERE id = ?').get(id) as SystemLog | null;
  },

  delete: (id) => {
    db.prepare('DELETE FROM system_logs WHERE id = ?').run(id);
  }
};
