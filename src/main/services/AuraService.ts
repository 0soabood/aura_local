import { RoadmapRepository } from '../../db/repositories/RoadmapRepository';
import { SystemLogRepository } from '../../db/repositories/SystemLogRepository';
import { runTransaction } from '../../db/connection';
import { RoadmapItem, WorkflowStatus } from '../../shared/types';

/**
 * AuraService: Orchestrates the domain logic and handles transaction boundaries.
 */
export const AuraService = {
  /**
   * Captures a milestone and audits it in a single atomic operation.
   */
  async createRoadmapMilestone(title: string, description: string, priority: number, roi_score: number = 0, lane: string = 'general') {
    return runTransaction(() => {
      const id = crypto.randomUUID();
      
      // 1. Create the item
      RoadmapRepository.create({
        id,
        title,
        description,
        priority,
        roi_score,
        lane,
        status: 'todo'
      });

      // 2. Audit the creation
      SystemLogRepository.create(
        'audit', 
        'ROADMAP', 
        `New milestone created: ${title}`, 
        { id, priority, roi_score }
      );

      return { id };
    });
  },

  async updateMilestone(id: string, updates: Partial<RoadmapItem>) {
    return runTransaction(() => {
      RoadmapRepository.update(id, updates);
      SystemLogRepository.create('info', 'ROADMAP', `Milestone ${id} updated`, { updates });
    });
  }
};
