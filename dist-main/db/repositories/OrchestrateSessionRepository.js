"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrchestrateSessionRepository = void 0;
const connection_1 = __importDefault(require("../connection"));
exports.OrchestrateSessionRepository = {
    create(id, title) {
        connection_1.default.prepare(`INSERT INTO orchestrate_sessions (id, title) VALUES (?, ?)`).run(id, title);
        return connection_1.default.prepare(`SELECT * FROM orchestrate_sessions WHERE id = ?`).get(id);
    },
    list(limit = 50) {
        return connection_1.default.prepare(`SELECT * FROM orchestrate_sessions ORDER BY updated_at DESC LIMIT ?`).all(limit);
    },
    findById(id) {
        return connection_1.default.prepare(`SELECT * FROM orchestrate_sessions WHERE id = ?`).get(id) ?? null;
    },
    touch(id) {
        connection_1.default.prepare(`UPDATE orchestrate_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    },
    delete(id) {
        connection_1.default.prepare(`DELETE FROM orchestrate_sessions WHERE id = ?`).run(id);
    },
};
