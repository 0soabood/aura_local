"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemLogRepository = void 0;
const connection_1 = __importDefault(require("../connection"));
exports.SystemLogRepository = {
    create: (level, module, message, payload) => {
        const stmt = connection_1.default.prepare(`
      INSERT INTO system_logs (level, module, message, payload)
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(level, module, message, payload ? JSON.stringify(payload) : null);
    },
    list: (limit = 100) => {
        return connection_1.default.prepare('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?').all(limit);
    },
    findById: (id) => {
        return connection_1.default.prepare('SELECT * FROM system_logs WHERE id = ?').get(id);
    },
    delete: (id) => {
        connection_1.default.prepare('DELETE FROM system_logs WHERE id = ?').run(id);
    }
};
