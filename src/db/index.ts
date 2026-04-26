import db from './connection';

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
        verification_state TEXT DEFAULT 'unverified'
          CHECK (verification_state IN ('unverified','self_checked','source_checked','accepted','rejected')),
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
        status TEXT DEFAULT 'queued'
          CHECK (status IN ('queued','running','completed','failed')),
        tokens_input INTEGER,
        tokens_output INTEGER,
        latency_ms INTEGER,
        verification_state TEXT DEFAULT 'unverified'
          CHECK (verification_state IN ('unverified','self_checked','source_checked','accepted','rejected')),
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
        verification_state TEXT DEFAULT 'unverified'
          CHECK (verification_state IN ('unverified','self_checked','source_checked','accepted','rejected')),
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
        verification_state TEXT DEFAULT 'unverified'
          CHECK (verification_state IN ('unverified','self_checked','source_checked','accepted','rejected')),
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

      -- v2: Blackboard — shared context store for multi-model supervisor runs
      -- Keys are session-scoped; upsert semantics via ON CONFLICT clause.
      CREATE TABLE IF NOT EXISTS blackboard (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id   TEXT    NOT NULL,
        key          TEXT    NOT NULL,
        value        TEXT    NOT NULL, -- JSON
        published_by TEXT    NOT NULL, -- "provider:model" string
        published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at   DATETIME,         -- NULL = no TTL
        consumed_count INTEGER DEFAULT 0,
        UNIQUE(session_id, key)
      );

      -- v2: Supervisor aggregate stats — composite PK, upsert-friendly
      CREATE TABLE IF NOT EXISTS supervisor_stats (
        supervisor          TEXT NOT NULL,
        domain              TEXT NOT NULL,
        tasks_completed     INTEGER DEFAULT 0,
        roi_total           REAL    DEFAULT 0,
        total_latency_ms    REAL    DEFAULT 0,
        updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (supervisor, domain)
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
    // v2 supervisor columns
    addColumn('model_runs', 'supervisor', 'TEXT');
    addColumn('model_runs', 'domain', 'TEXT');
    addColumn('model_runs', 'escalation_reason', 'TEXT');

    // Migrate blackboard_events if the old CHECK constraint is still in place.
    // SQLite doesn't support ALTER COLUMN so we recreate the table when the old
    // definition is detected (no 'code_written' in the check expression).
    const beInfo = db.prepare(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='blackboard_events'`,
    ).get() as { sql: string } | undefined;
    if (beInfo && !beInfo.sql.includes('code_written')) {
      db.exec(`
        ALTER TABLE blackboard_events RENAME TO blackboard_events_old;
        CREATE TABLE blackboard_events (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id  TEXT    NOT NULL,
          seq         INTEGER NOT NULL,
          event_type  TEXT    NOT NULL
            CHECK (event_type IN (
              'user_message','agent_output','execution_error',
              'synthesis_complete','escalation_required',
              'code_context_retrieved','code_written'
            )),
          author      TEXT    NOT NULL,
          content     TEXT    NOT NULL,
          metadata    TEXT,
          created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(session_id, seq)
        );
        INSERT INTO blackboard_events SELECT * FROM blackboard_events_old;
        DROP TABLE blackboard_events_old;
      `);
      console.log('[MIGRATION] Rebuilt blackboard_events with expanded CHECK constraint');
    }

    db.exec(`
      -- v3: Reactive Blackboard — append-only event ledger.
      -- Unlike the upsert-keyed 'blackboard' table above, every write is a new row.
      -- seq is monotonically increasing per session (enforced by the repository
      -- inside a transaction; no DB trigger needed because better-sqlite3 is sync).
      CREATE TABLE IF NOT EXISTS blackboard_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id  TEXT    NOT NULL,
        seq         INTEGER NOT NULL,
        event_type  TEXT    NOT NULL
          CHECK (event_type IN (
            'user_message','agent_output','execution_error',
            'synthesis_complete','escalation_required',
            'code_context_retrieved','code_written'
          )),
        author      TEXT    NOT NULL,
        content     TEXT    NOT NULL,
        metadata    TEXT,               -- JSON: { confidence?, latency_ms?, model_id? }
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, seq)
      );

      -- v3: Orchestrate sessions — one row per reactive session so we can list
      -- and manage sessions in the UI.  The session_id is the same UUID used in
      -- blackboard_events; title is derived from the first user_message.
      CREATE TABLE IF NOT EXISTS orchestrate_sessions (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Indexes for common read paths
      CREATE INDEX IF NOT EXISTS idx_snippets_session ON research_snippets(session_id);
      CREATE INDEX IF NOT EXISTS idx_model_runs_session ON model_runs(session_id);
      CREATE INDEX IF NOT EXISTS idx_roadmap_status ON roadmap_items(status);
      CREATE INDEX IF NOT EXISTS idx_roi_source ON roi_events(source);
      CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
      CREATE INDEX IF NOT EXISTS idx_blackboard_session ON blackboard(session_id, published_at);
      CREATE INDEX IF NOT EXISTS idx_blackboard_expiry ON blackboard(expires_at);
      CREATE INDEX IF NOT EXISTS idx_be_session ON blackboard_events(session_id, seq);
      CREATE INDEX IF NOT EXISTS idx_be_type    ON blackboard_events(event_type);
    `);
  }
};

export default db;
