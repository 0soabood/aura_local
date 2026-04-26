"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoadmapRepository = void 0;
const connection_1 = __importDefault(require("../connection"));
const types_1 = require("../../shared/types");
exports.RoadmapRepository = {
    create: (item) => {
        const stmt = connection_1.default.prepare(`
      INSERT INTO roadmap_items (id, title, description, priority, roi_score, lane, status, due_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(item.id, item.title, item.description || null, item.priority || 0, item.roi_score || 0, item.lane || 'general', item.status || 'todo', item.due_at || null);
    },
    list: (status) => {
        if (status) {
            return connection_1.default.prepare('SELECT * FROM roadmap_items WHERE status = ? ORDER BY priority DESC, roi_score DESC').all(status);
        }
        return connection_1.default.prepare('SELECT * FROM roadmap_items ORDER BY priority DESC, roi_score DESC').all();
    },
    update: (id, updates) => {
        if (updates.verification_state !== undefined) {
            (0, types_1.assertVerificationState)(updates.verification_state);
        }
        const keys = Object.keys(updates).filter(k => k !== 'id');
        if (keys.length === 0)
            return;
        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const values = keys.map(k => updates[k]);
        connection_1.default.prepare(`UPDATE roadmap_items SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(...values, id);
    },
    delete: (id) => {
        connection_1.default.prepare('DELETE FROM roadmap_items WHERE id = ?').run(id);
    }
};
