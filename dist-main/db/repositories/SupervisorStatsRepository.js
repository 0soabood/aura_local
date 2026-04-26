"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupervisorStatsRepository = void 0;
const connection_1 = __importDefault(require("../connection"));
exports.SupervisorStatsRepository = {
    /**
     * Upsert: add one completed task to a supervisor/domain pair.
     * avg_completion_time_ms is derived at read time as total / count.
     */
    record(supervisor, domain, roiEstimate, latencyMs) {
        connection_1.default.prepare(`
      INSERT INTO supervisor_stats (supervisor, domain, tasks_completed, roi_total, total_latency_ms)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(supervisor, domain) DO UPDATE SET
        tasks_completed  = tasks_completed + 1,
        roi_total        = roi_total + excluded.roi_total,
        total_latency_ms = total_latency_ms + excluded.total_latency_ms,
        updated_at       = CURRENT_TIMESTAMP
    `).run(supervisor, domain, roiEstimate, latencyMs);
    },
    findAll() {
        const rows = connection_1.default.prepare(`SELECT * FROM supervisor_stats ORDER BY domain, supervisor`).all();
        return rows.map(r => ({
            ...r,
            avg_completion_time_ms: r.tasks_completed > 0
                ? Math.round(r.total_latency_ms / r.tasks_completed)
                : 0,
        }));
    },
    findByDomain(domain) {
        const rows = connection_1.default.prepare(`SELECT * FROM supervisor_stats WHERE domain = ?`).all(domain);
        return rows.map(r => ({
            ...r,
            avg_completion_time_ms: r.tasks_completed > 0
                ? Math.round(r.total_latency_ms / r.tasks_completed)
                : 0,
        }));
    },
    /** Utilisation: % of supervisor entries that have been consumed at least once */
    blackboardUtilisation() {
        const row = connection_1.default.prepare(`
      SELECT
        COUNT(*) FILTER (WHERE consumed_count > 0) * 100.0 / NULLIF(COUNT(*), 0) AS pct
      FROM blackboard
    `).get();
        return Math.round(row?.pct ?? 0);
    },
};
