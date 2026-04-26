"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const StatsRepository_1 = require("./StatsRepository");
const connection_1 = __importDefault(require("../connection"));
// Schema migration + per-test table wipe come from tests/setup.ts.
/**
 * Telemetry contract under test (see TELEMETRY_FORMULAS in src/shared/types.ts):
 *   totalValueSignal = SUM(roadmap_items.roi_score WHERE status = 'done')
 *   tasksCompleted   = COUNT(roadmap_items WHERE status = 'done')
 *   activeProposals  = COUNT(roadmap_items WHERE status != 'done')
 *   researchDensity  = COUNT(research_snippets)
 *   systemHealth     = trusted_snippets / total_snippets * 100
 *                      (trusted = accepted | source_checked)
 *
 * roi_events is intentionally NOT consulted — the canonical value signal
 * comes from completed roadmap items only.
 */
(0, vitest_1.describe)('StatsRepository', () => {
    (0, vitest_1.it)('calculates roadmap-derived metrics from completed items only', () => {
        const stmt = connection_1.default.prepare('INSERT INTO roadmap_items (id, title, status, roi_score) VALUES (?, ?, ?, ?)');
        stmt.run('r1', 'Shipped Feature', 'done', 250);
        stmt.run('r2', 'Shipped Bugfix', 'done', 50.5);
        stmt.run('r3', 'In-Flight Spec', 'in_progress', 999); // must NOT count
        stmt.run('r4', 'Backlog Idea', 'todo', 1000); // must NOT count
        const metrics = StatsRepository_1.StatsRepository.getMetrics();
        (0, vitest_1.expect)(metrics.totalValueSignal).toBe(300.5); // 250 + 50.5, only 'done'
        (0, vitest_1.expect)(metrics.tasksCompleted).toBe(2);
        (0, vitest_1.expect)(metrics.activeProposals).toBe(2); // r3 + r4
    });
    (0, vitest_1.it)('ignores roi_events entirely (canonical formula is roadmap-derived)', () => {
        const roi = connection_1.default.prepare('INSERT INTO roi_events (id, type, amount, source) VALUES (?, ?, ?, ?)');
        roi.run('e1', 'income', 10_000, 'trading_bot');
        roi.run('e2', 'expense', 2_000, 'infra');
        // No roadmap items at all
        const metrics = StatsRepository_1.StatsRepository.getMetrics();
        (0, vitest_1.expect)(metrics.totalValueSignal).toBe(0);
        (0, vitest_1.expect)(metrics.tasksCompleted).toBe(0);
    });
    (0, vitest_1.it)('computes systemHealth from the trusted snippet set', () => {
        const snippet = connection_1.default.prepare('INSERT INTO research_snippets (id, title, verification_state) VALUES (?, ?, ?)');
        snippet.run('s1', 'A', 'accepted'); // trusted
        snippet.run('s2', 'B', 'source_checked'); // trusted
        snippet.run('s3', 'C', 'self_checked'); // NOT trusted
        snippet.run('s4', 'D', 'unverified'); // NOT trusted
        const metrics = StatsRepository_1.StatsRepository.getMetrics();
        (0, vitest_1.expect)(metrics.researchDensity).toBe(4);
        (0, vitest_1.expect)(metrics.systemHealth).toBe(50); // 2 trusted / 4 total
    });
    (0, vitest_1.it)('returns 100 systemHealth when there are no snippets at all', () => {
        const metrics = StatsRepository_1.StatsRepository.getMetrics();
        (0, vitest_1.expect)(metrics.systemHealth).toBe(100);
        (0, vitest_1.expect)(metrics.researchDensity).toBe(0);
    });
});
