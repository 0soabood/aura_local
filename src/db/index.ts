import db from './connection';
import { ResearchSnippet, SystemLog, WorkflowStatus } from '../shared/types';

export const schema = {
  up: () => {
    db.exec(`
      -- Global Settings
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Research Sessions
      CREATE TABLE IF NOT EXISTS research_sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'in_progress',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Research Snippets
      CREATE TABLE IF NOT EXISTS research_snippets (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        title TEXT NOT NULL,
        content TEXT,
        tags TEXT,
        source_url TEXT,
        verification_state TEXT DEFAULT 'unverified',
        verification_reasoning TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES research_sessions(id) ON DELETE SET NULL
      );

      -- Model Execute Logs
      CREATE TABLE IF NOT EXISTS model_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        model_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        response TEXT,
        status TEXT DEFAULT 'queued',
        tokens_input INTEGER,
        tokens_output INTEGER,
        latency_ms INTEGER,
        verification_state TEXT DEFAULT 'unverified',
        verification_reasoning TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES research_sessions(id) ON DELETE SET NULL
      );

      -- Productivity Roadmap
      CREATE TABLE IF NOT EXISTS roadmap_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        priority INTEGER DEFAULT 0,
        roi_score REAL DEFAULT 0,
        lane TEXT DEFAULT 'general',
        status TEXT DEFAULT 'todo',
        verification_state TEXT DEFAULT 'unverified',
        verification_reasoning TEXT,
        due_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Financial / ROI Events
      CREATE TABLE IF NOT EXISTS roi_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- income | expense
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'USD',
        source TEXT NOT NULL,
        description TEXT,
        verification_state TEXT DEFAULT 'unverified',
        occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Audit Trail
      CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        module TEXT NOT NULL,
        message TEXT NOT NULL,
        payload TEXT, -- JSON payload
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Migration: Ensure columns exist (Surgical)
      -- Using try/catch logic per column since ALTER TABLE can't be conditional easily in raw SQL
    `);

    // Helper to add column if it doesn't exist
    const addColumn = (table: string, column: string, type: string) => {
      try {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
        console.log(`[MIGRATION] Added ${column} to ${table}`);
      } catch (e: any) {
        if (!e.message.includes('duplicate column name')) {
          console.warn(`[MIGRATION-WARN] ${e.message}`);
        }
      }
    };

    addColumn('research_snippets', 'session_id', 'TEXT');
    addColumn('research_snippets', 'verification_reasoning', 'TEXT');
    addColumn('model_runs', 'session_id', 'TEXT');
    addColumn('model_runs', 'status', "TEXT DEFAULT 'queued'");
    addColumn('model_runs', 'verification_reasoning', 'TEXT');
    addColumn('roadmap_items', 'verification_reasoning', 'TEXT');

    db.exec(`
      -- Indexes for common read paths
      CREATE INDEX IF NOT EXISTS idx_snippets_session ON research_snippets(session_id);
      CREATE INDEX IF NOT EXISTS idx_model_runs_session ON model_runs(session_id);
      CREATE INDEX IF NOT EXISTS idx_roadmap_status ON roadmap_items(status);
      CREATE INDEX IF NOT EXISTS idx_roi_source ON roi_events(source);
      CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
    `);
  }
};

export default db;
