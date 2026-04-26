"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const RoadmapRepository_1 = require("./RoadmapRepository");
// Schema migration + per-test table wipe come from tests/setup.ts.
(0, vitest_1.describe)('RoadmapRepository', () => {
    (0, vitest_1.it)('should create and list roadmap items sorted by priority and ROI', () => {
        RoadmapRepository_1.RoadmapRepository.create({
            id: 'item-1',
            title: 'Low Priority',
            priority: 1,
            roi_score: 50
        });
        RoadmapRepository_1.RoadmapRepository.create({
            id: 'item-2',
            title: 'High Priority',
            priority: 10,
            roi_score: 500
        });
        const items = RoadmapRepository_1.RoadmapRepository.list();
        (0, vitest_1.expect)(items).toHaveLength(2);
        (0, vitest_1.expect)(items[0].id).toBe('item-2'); // Higher priority first
        (0, vitest_1.expect)(items[0].roi_score).toBe(500);
    });
    (0, vitest_1.it)('should perform partial updates correctly', () => {
        RoadmapRepository_1.RoadmapRepository.create({
            id: 'update-test',
            title: 'Original Title',
            status: 'todo'
        });
        RoadmapRepository_1.RoadmapRepository.update('update-test', { status: 'in_progress' });
        const items = RoadmapRepository_1.RoadmapRepository.list('in_progress');
        (0, vitest_1.expect)(items).toHaveLength(1);
        (0, vitest_1.expect)(items[0].title).toBe('Original Title');
        (0, vitest_1.expect)(items[0].status).toBe('in_progress');
    });
    (0, vitest_1.it)('should handle missing items during update gracefully', () => {
        (0, vitest_1.expect)(() => {
            RoadmapRepository_1.RoadmapRepository.update('non-existent', { title: 'New' });
        }).not.toThrow();
    });
});
