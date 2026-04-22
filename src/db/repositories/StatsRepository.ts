import db from '../connection';
import { TelemetryMetrics, VERIFIED_VERIFICATION_STATES } from '../../shared/types';

export const StatsRepository = {
  getMetrics: (): TelemetryMetrics => {
    // 1. Value Signal: SUM(roadmap_items.roi_score WHERE status = 'done')
    const valueSignal = db.prepare("SELECT SUM(roi_score) as total FROM roadmap_items WHERE status = 'done'").get() as any;
    
    // 2. Task Stats
    const tasksDone = db.prepare("SELECT COUNT(*) as count FROM roadmap_items WHERE status = 'done'").get() as any;
    const activeProposals = db.prepare("SELECT COUNT(*) as count FROM roadmap_items WHERE status != 'done'").get() as any;
    
    // 3. Research Density
    const snippetsCount = db.prepare("SELECT COUNT(*) as count FROM research_snippets").get() as any;

    // 4. Execution Velocity (Done in last 7 days)
    const velocity = db.prepare(`
      SELECT COUNT(*) as count 
      FROM roadmap_items 
      WHERE status = 'done' 
      AND updated_at >= date('now', '-7 days')
    `).get() as any;

    // 5. System Health: trusted snippets / total snippets
    const placeholders = VERIFIED_VERIFICATION_STATES.map(() => '?').join(', ');
    const verified = db
      .prepare(`SELECT COUNT(*) as count FROM research_snippets WHERE verification_state IN (${placeholders})`)
      .get(...VERIFIED_VERIFICATION_STATES) as any;
    const totalRecords = db.prepare("SELECT COUNT(*) as count FROM research_snippets").get() as any;
    const health = totalRecords.count > 0 ? (verified.count / totalRecords.count) * 100 : 100;

    // 6. Recent Activity (Daily Logs for last 7 days)
    const activity = db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as count 
      FROM system_logs 
      WHERE created_at >= date('now', '-7 days')
      GROUP BY day
      ORDER BY day ASC
    `).all() as any[];

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
