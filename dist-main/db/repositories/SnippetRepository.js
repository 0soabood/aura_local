"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnippetRepository = void 0;
const connection_1 = __importDefault(require("../connection"));
const types_1 = require("../../shared/types");
exports.SnippetRepository = {
    findAll: () => {
        return connection_1.default.prepare('SELECT * FROM research_snippets ORDER BY created_at DESC').all();
    },
    create: (snippet) => {
        const stmt = connection_1.default.prepare(`
      INSERT INTO research_snippets (id, title, content, tags, source_url, verification_state)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
        return stmt.run(snippet.id, snippet.title, snippet.content, JSON.stringify(snippet.tags || []), snippet.source_url || null, 'unverified');
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
        connection_1.default.prepare(`UPDATE research_snippets SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(...values, id);
    },
    delete: (id) => {
        return connection_1.default.prepare('DELETE FROM research_snippets WHERE id = ?').run(id);
    }
};
