"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRunRepository = void 0;
const connection_1 = __importDefault(require("../connection"));
const types_1 = require("../../shared/types");
exports.ModelRunRepository = {
    create: (run) => {
        const stmt = connection_1.default.prepare(`
      INSERT INTO model_runs (id, session_id, model_id, prompt, status)
      VALUES (?, ?, ?, ?, ?)
    `);
        return stmt.run(run.id, run.session_id || null, run.model_id, run.prompt, run.status || 'queued');
    },
    list: (limit = 100) => {
        return connection_1.default.prepare('SELECT * FROM model_runs ORDER BY created_at DESC LIMIT ?').all(limit);
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
        connection_1.default.prepare(`UPDATE model_runs SET ${setClause} WHERE id = ?`)
            .run(...values, id);
    }
};
