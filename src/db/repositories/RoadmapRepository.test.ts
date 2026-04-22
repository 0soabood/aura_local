import { describe, it, expect } from 'vitest';
import { RoadmapRepository } from './RoadmapRepository';

// Schema migration + per-test table wipe come from tests/setup.ts.

describe('RoadmapRepository', () => {
  it('should create and list roadmap items sorted by priority and ROI', () => {
    RoadmapRepository.create({
      id: 'item-1',
      title: 'Low Priority',
      priority: 1,
      roi_score: 50
    });

    RoadmapRepository.create({
      id: 'item-2',
      title: 'High Priority',
      priority: 10,
      roi_score: 500
    });

    const items = RoadmapRepository.list();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('item-2'); // Higher priority first
    expect(items[0].roi_score).toBe(500);
  });

  it('should perform partial updates correctly', () => {
    RoadmapRepository.create({
      id: 'update-test',
      title: 'Original Title',
      status: 'todo'
    });

    RoadmapRepository.update('update-test', { status: 'in_progress' });
    
    const items = RoadmapRepository.list('in_progress');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Original Title');
    expect(items[0].status).toBe('in_progress');
  });

  it('should handle missing items during update gracefully', () => {
    expect(() => {
      RoadmapRepository.update('non-existent', { title: 'New' });
    }).not.toThrow();
  });
});
