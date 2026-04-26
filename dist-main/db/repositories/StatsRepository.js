"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatsRepository = void 0;
const connection_1 = __importDefault(require("../connection"));
const types_1 = require("../../shared/types");
exports.StatsRepository = {
    getMetrics: () => {
        // 1. Value Signal: SUM(roadmap_items.roi_score WHERE status = 'done')
        const valueSignal = connection_1.default.prepare("SELECT SUM(roi_score) as total FROM roadmap_items WHERE status = 'done'").get();
        // 2. Task Stats
        const tasksDone = connection_1.default.prepare("SELECT COUNT(*) as count FROM roadmap_items WHERE status = 'done'").get();
        const activeProposals = connection_1.default.prepare("SELECT COUNT(*) as count FROM roadmap_items WHERE status != 'done'").get();
        // 3. Research Density
        const snippetsCount = connection_1.default.prepare("SELECT COUNT(*) as count FROM research_snippets").get();
        // 4. Execution Velocity (Done in last 7 days)
        const velocity = connection_1.default.prepare(`
      SELECT COUNT(*) as count 
      FROM roadmap_items 
      WHERE status = 'done' 
      AND updated_at >= date('now', '-7 days')
    `).get();
        // 5. System Health: trusted snippets / total snippets
        const placeholders = types_1.VERIFIED_VERIFICATION_STATES.map(() => '?').join(', ');
        const verified = connection_1.default
            .prepare(`SELECT COUNT(*) as count FROM research_snippets WHERE verification_state IN (${placeholders})`)
            .get(...types_1.VERIFIED_VERIFICATION_STATES);
        const totalRecords = connection_1.default.prepare("SELECT COUNT(*) as count FROM research_snippets").get();
        const health = totalRecords.count > 0 ? (verified.count / totalRecords.count) * 100 : 100;
        // 6. Recent Activity (Daily Logs for last 7 days)
        const activity = connection_1.default.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count 
      FROM system_logs 
      WHERE created_at >= date('now', '-7 days')
      GROUP BY day
      ORDER BY day ASC
    `).all();
        return {
            totalValueSignal: valueSignal.total || 0,
            tasksCompleted: tasksDone.count || 0,
            activeProposals: activeProposals.count || 0,
            executionVelocity: velocity.count || 0,
            researchDensity: snippetsCount.count || 0,
            systemHealth: Math.round(health),
            recentActivity: activity
        };
    }
};
