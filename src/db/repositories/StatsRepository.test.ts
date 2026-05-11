import { describe, it, expect, beforeEach } from 'vitest';
import { StatsRepository } from './StatsRepository';
import db from '../connection';

describe('StatsRepository', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM research_snippets').run();
    db.prepare('DELETE FROM roadmap_items').run();
    db.prepare('DELETE FROM roi_events').run();
  });

  it('should calculate telemetry metrics correctly', () => {
    // 1. Mock Research Snippets (Density + Health)
    const snippetStmt = db.prepare('INSERT INTO research_snippets (id, title, verification_state) VALUES (?, ?, ?)');
    snippetStmt.run('s1', 'Snippet 1', 'accepted');
    snippetStmt.run('s2', 'Snippet 2', 'source_checked');
    snippetStmt.run('s3', 'Snippet 3', 'unverified');

    // 2. Mock ROI Events (Value Signal)
    const roiStmt = db.prepare('INSERT INTO roi_events (id, type, amount, source) VALUES (?, ?, ?, ?)');
    roiStmt.run('e1', 'income', 1000, 'test');
    roiStmt.run('e2', 'expense', 200, 'test');

    // 3. Mock Roadmap Items
    const roadStmt = db.prepare('INSERT INTO roadmap_items (id, title, status) VALUES (?, ?, ?)');
    roadStmt.run('r1', 'Done Item', 'done');
    roadStmt.run('r2', 'Active Item', 'todo');

    const metrics = StatsRepository.getMetrics();

    expect(metrics.researchDensity).toBe(3);
    expect(metrics.totalValueSignal).toBe(0); // Sum of done roadmap ROI score
    expect(metrics.tasksCompleted).toBe(1);
    expect(metrics.activeProposals).toBe(1);
    expect(metrics.systemHealth).toBe(67); // 2 trusted / 3 total snippets
  });
});
