"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuraService = void 0;
const RoadmapRepository_1 = require("../../db/repositories/RoadmapRepository");
const SystemLogRepository_1 = require("../../db/repositories/SystemLogRepository");
const connection_1 = require("../../db/connection");
/**
 * AuraService: Orchestrates the domain logic and handles transaction boundaries.
 */
exports.AuraService = {
    /**
     * Captures a milestone and audits it in a single atomic operation.
     */
    async createRoadmapMilestone(title, description, priority, roi_score = 0, lane = 'general') {
        return (0, connection_1.runTransaction)(() => {
            const id = crypto.randomUUID();
            // 1. Create the item
            RoadmapRepository_1.RoadmapRepository.create({
                id,
                title,
                description,
                priority,
                roi_score,
                lane,
                status: 'todo'
            });
            // 2. Audit the creation
            SystemLogRepository_1.SystemLogRepository.create('audit', 'ROADMAP', `New milestone created: ${title}`, { id, priority, roi_score });
            return { id };
        });
    },
    async updateMilestone(id, updates) {
        return (0, connection_1.runTransaction)(() => {
            RoadmapRepository_1.RoadmapRepository.update(id, updates);
            SystemLogRepository_1.SystemLogRepository.create('info', 'ROADMAP', `Milestone ${id} updated`, { updates });
        });
    }
};
