/**
 * AURA_LOCAL_SYNC Shared Type Definitions
 */

// Source-of-truth verification taxonomy for all domain records.
export const VERIFICATION_STATES = [
  'unverified',
  'self_checked',
  'source_checked',
  'accepted',
  'rejected',
] as const;

export type VerificationState = (typeof VERIFICATION_STATES)[number];

// States that count as trusted for telemetry health calculations.
export const VERIFIED_VERIFICATION_STATES: readonly VerificationState[] = [
  'accepted',
  'source_checked',
];

// Runtime guard. Use at any boundary that accepts a verification_state from
// untrusted input (HTTP body, partial update payload, etc.). Throws on drift.
export function isVerificationState(value: unknown): value is VerificationState {
  return typeof value === 'string'
    && (VERIFICATION_STATES as readonly string[]).includes(value);
}

export function assertVerificationState(value: unknown): VerificationState {
  if (!isVerificationState(value)) {
    throw new Error(
      `Invalid verification_state: ${JSON.stringify(value)}. ` +
      `Allowed: ${VERIFICATION_STATES.join(', ')}`
    );
  }
  return value;
}

// Canonical telemetry formulas; repositories should implement these definitions exactly.
export const TELEMETRY_FORMULAS = {
  totalValueSignal: "SUM(roadmap_items.roi_score WHERE status = 'done')",
  tasksCompleted: "COUNT(roadmap_items WHERE status = 'done')",
  activeProposals: "COUNT(roadmap_items WHERE status != 'done')",
  executionVelocity: "COUNT(roadmap_items WHERE status = 'done' AND updated_at in last 7 days)",
  researchDensity: 'COUNT(research_snippets)',
  systemHealth: 'ROUND((trusted_snippets / total_snippets) * 100) where trusted_snippets = accepted OR source_checked',
  recentActivity: 'COUNT(system_logs) GROUP BY date(created_at) for last 7 days',
} as const;

export type WorkflowStatus = 'backlog' | 'todo' | 'in_progress' | 'done' | 'archived';

export interface VerificationAudit {
  state: VerificationState;
  reasoning?: string;
  verified_at?: string;
}

export interface ResearchSession {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  created_at: string;
  updated_at: string;
}

export interface ResearchSnippet {
  id: string;
  session_id?: string;
  title: string;
  content: string;
  tags: string; // JSON string in DB
  source_url?: string;
  verification_state: VerificationState;
  verification_reasoning?: string;
  created_at: string;
  updated_at: string;
}

export interface ModelRun {
  id: string;
  session_id?: string;
  model_id: string;
  prompt: string;
  response?: string;
  // Lifecycle of the model run itself. Trust/verification is tracked
  // separately on `verification_state` — do not conflate the two.
  status: 'queued' | 'running' | 'completed' | 'failed';
  tokens_input?: number;
  tokens_output?: number;
  latency_ms?: number;
  verification_state: VerificationState;
  verification_reasoning?: string;
  // v2 supervisor fields
  supervisor?: string;
  domain?: SupervisorDomain;
  escalation_reason?: string;
  created_at: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description?: string;
  priority: number;
  roi_score: number;
  lane: string;
  tags?: string; // JSON-stringified string[] — optional for backward compat
  status: WorkflowStatus;
  verification_state: VerificationState;
  verification_reasoning?: string;
  due_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ROIEvent {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  source: string; // e.g., 'trading_bot_v1', 'consulting'
  description?: string;
  verification_state: VerificationState;
  occurred_at: string;
  created_at: string;
}

export interface SystemLog {
  id: number;
  level: 'info' | 'warn' | 'error' | 'audit';
  module: string;
  message: string;
  payload?: string; // JSON
  created_at: string;
}

export interface TelemetryMetrics {
  totalValueSignal: number;
  tasksCompleted: number;
  activeProposals: number;
  executionVelocity: number; // tasks per week
  researchDensity: number; // snippets count
  systemHealth: number; // verification %
  recentActivity: { day: string; count: number }[];
}

// ── v2: Supervisor / Multi-model types ──────────────────────────────────────

export type SupervisorDomain = 'research' | 'code' | 'planning';

export interface Step {
  model: string;                                       // "provider:model-id"
  prompt: string;
  expected_output_shape: 'json' | 'text' | 'code';
  result?: string;                                     // populated after execution
  latency_ms?: number;
}

export interface SupervisorTask {
  domain: SupervisorDomain;
  objective: string;
  sessionId: string;
  depth?: number;                                      // escalation recursion guard
}

export interface SupervisorPlan {
  model_sequence: string[];
  reasoning: string;
  steps: Step[];
  blackboard_updates: Record<string, any>;
  escalation: boolean;
  escalation_reason: string | null;
  next_supervisor?: SupervisorDomain;
  roi_estimate: number;                                // 0–10
}

export interface SupervisorResponse extends SupervisorPlan {
  supervisor: string;
  domain: SupervisorDomain;
  final_response: string;
  total_latency_ms: number;
}

export interface BlackboardEntry {
  id: number;
  session_id: string;
  key: string;
  value: string;                                       // JSON string
  published_by: string;
  published_at: string;
  expires_at: string | null;
  consumed_count: number;
}

export interface SupervisorStats {
  supervisor: string;
  domain: SupervisorDomain;
  tasks_completed: number;
  roi_total: number;
  total_latency_ms: number;
  /** Computed: total_latency_ms / tasks_completed */
  avg_completion_time_ms: number;
}

export interface OrchestrateSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface OrchestrateResponse extends OrchestratorResult {
  run_id: string;
  session_id: string;
}

export interface AuraAPI {
  // Model Runs
  createModelRun: (data: Partial<ModelRun>) => Promise<{ id: string }>;
  listModelRuns: (limit?: number) => Promise<ModelRun[]>;
  updateModelRun: (id: string, updates: Partial<ModelRun>) => Promise<void>;

  // Telemetry
  getStats: () => Promise<TelemetryMetrics>;

  // System Logs
  createLog: (level: SystemLog['level'], module: string, message: string, payload?: any) => Promise<void>;
  listLogs: (limit?: number) => Promise<SystemLog[]>;
  getLogById: (id: number) => Promise<SystemLog | null>;
  deleteLog: (id: number) => Promise<void>;

  // Roadmap
  createRoadmapItem: (data: any) => Promise<{ id: string }>;
  listRoadmapItems: () => Promise<RoadmapItem[]>;
  updateRoadmapItem: (id: string, updates: Partial<RoadmapItem>) => Promise<void>;
  deleteRoadmapItem: (id: string) => Promise<void>;

  // Research (Existing)
  getSnippets: () => Promise<ResearchSnippet[]>;
  createSnippet: (data: any) => Promise<{ id: string }>;
  updateSnippet: (id: string, updates: Partial<ResearchSnippet>) => Promise<void>;
  deleteSnippet: (id: string) => Promise<void>;
  checkHealth: () => Promise<boolean>;

  // v2: Supervisor routing (legacy)
  routeSupervisor: (task: Omit<SupervisorTask, 'depth'>) => Promise<SupervisorResponse>;

  // v3: Reactive orchestrator
  orchestrate: (message: string, sessionId?: string) => Promise<OrchestrateResponse>;

  // v3: Session management
  createSession: () => Promise<OrchestrateSession>;
  listSessions: () => Promise<OrchestrateSession[]>;
  getSessionEvents: (sessionId: string) => Promise<BlackboardEvent[]>;
  deleteSession: (sessionId: string) => Promise<void>;

  // UI layer — brutalist design components
  getStatsV2: () => Promise<TelemetryMetricsV2>;
  listSessionsV2: () => Promise<Session[]>;
  streamOrchestrate: (
    payload: { sessionId?: string; prompt: string },
    onEvent: (e: OrchestrateEvent) => void,
  ) => Promise<void>;
}

// ── UI design-layer additions ─────────────────────────────────────────────────

/** Richer session shape used by the brutalist UI components. */
export interface Session {
  id: string;
  name: string;
  created_at: string;
  state: 'running' | 'done' | 'error' | 'archived';
  token_count: number;
  model: string;
}

/** Alias for WorkflowStatus used by the brutalist Roadmap component. */
export type RoadmapStatus = WorkflowStatus;

/** Exported level union for use in SystemLogs component. */
export type LogLevel = SystemLog['level'];

/** SSE event envelope from the orchestrate stream. */
export interface OrchestrateEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'final' | 'error';
  ts: string;
  data: any;
}

/** Telemetry shape used by the ROI dashboard. */
export interface TelemetryMetricsV2 {
  total_routes: number;
  avg_latency_ms: number;
  success_rate: number;       // 0..1
  est_token_cost_usd: number;
  hourly_latency_ms: number[]; // 24 buckets
  spend_series_usd: number[];
}

declare global {
  interface Window {
    aura: AuraAPI;
  }
}

// ── v3: Reactive Blackboard / Actor-Pub-Sub types ────────────────────────────

export const EVENT_TYPES = [
  'user_message',
  'agent_output',
  'execution_error',
  'synthesis_complete',
  'escalation_required',
  'code_written',
  'code_context_retrieved',
  'blackboard_update',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const AGENT_NAMES = [
  'research_agent',
  'code_agent',
  'synthesis_agent',
  'orchestrator',
] as const;

export type AgentName = (typeof AGENT_NAMES)[number];

/** Row in the append-only blackboard_events ledger */
export interface BlackboardEvent {
  id: number;
  session_id: string;
  seq: number;              // monotonic per session, 1-based
  event_type: EventType;
  author: AgentName | 'user';
  content: string;          // raw text or JSON string — never binary
  metadata: string | null;  // JSON: { confidence?, latency_ms?, model_id?, … }
  created_at: string;
}

/** Returned by ReactiveAgent.evaluate() — zero-cost, synchronous, no LLM calls */
export interface AgentBid {
  agentName: AgentName;
  confidence: number;         // 0.0 (abstain) – 1.0 (certain)
  proposedAction: string;     // human-readable intent for logging
  expectedOutputShape: 'text' | 'json' | 'code';
}

/** Returned by ReactiveAgent.execute() — agent controls termination via event_type */
export interface AgentOutput {
  event_type: EventType;      // 'synthesis_complete' | 'escalation_required' signals loop exit
  content: string;
  metadata?: Record<string, unknown>;
}

export type OrchestratorTermination =
  | 'synthesis_complete'
  | 'escalation_required'
  | 'max_loops'
  | 'no_bid';

export interface OrchestratorResult {
  sessionId: string;
  events: BlackboardEvent[];
  finalResponse: string;
  totalLoops: number;
  totalLatencyMs: number;
  terminationReason: OrchestratorTermination;
}

/** Replaces SupervisorTask for the v3 orchestrator */
export interface OrchestratorTask {
  sessionId: string;
  message: string;  // the raw user text; no domain pre-classification needed
  onProgress?: (event: string, data: any) => void;
}
