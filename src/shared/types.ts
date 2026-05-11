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
  status: 'queued' | 'running' | 'completed' | 'failed' | 'verified';
  tokens_input?: number;
  tokens_output?: number;
  latency_ms?: number;
  verification_state: VerificationState;
  verification_reasoning?: string;
  supervisor?: string;
  domain?: string;
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
  tags?: string;
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

  listSessions?: () => Promise<Session[]>;
  listSessionsV2?: () => Promise<Session[]>;
  createSession?: () => Promise<{ id: string, status?: string }>;
  updateSession?: (sessionId: string, updates: any) => Promise<void>;
  getSessionEvents?: (sessionId: string) => Promise<BlackboardEvent[]>;
  deleteSession?: (sessionId: string) => Promise<void>;
  getRoiEvents?: () => Promise<ROIEvent[]>;
  createRoiEvent?: (data: any) => Promise<{ id: string }>;
  updateRoiEvent?: (id: string, updates: any) => Promise<void>;
  deleteRoiEvent?: (id: string) => Promise<void>;
  orchestrate?: (message: string, sessionId?: string) => Promise<any>;
  streamOrchestrate?: (payload: any, onEvent: (event: string, data: any) => void) => Promise<void>;
  routeSupervisor?: (task: any) => Promise<any>;
  saveSettings?: (settings: any) => Promise<void>;
  loadSettings?: () => Promise<any>;
  getAvailableModels?: () => Promise<any>;
  getActiveProvider?: () => Promise<string>;
  getStatsV2?: () => Promise<TelemetryMetricsV2>;
}

declare global {
  interface Window {
    aura: AuraAPI;
  }
}

export interface TelemetryMetricsV2 {
  total_routes: number;
  avg_latency_ms: number;
  success_rate: number;
  est_token_cost_usd: number;
  route_count_series: number[];
  hourly_latency_ms: number[];
  success_rate_series: number[];
  spend_series_usd: number[];
  top_consumers: { name: string; cost: number }[];
}

export type RoadmapStatus = WorkflowStatus;
export type LogLevel = SystemLog['level'];

export interface Session {
  id: string;
  name?: string;
  title?: string;
  state?: 'running' | 'idle' | 'done' | 'error' | 'archived';
  status?: string;
  token_count?: number;
  created_at?: string;
  updated_at: string;
}

export type EventType =
  | 'user_message'
  | 'agent_output'
  | 'code_written'
  | 'synthesis_complete'
  | 'execution_error'
  | 'escalation_required'
  | 'agent_event'
  | string;

export type AgentName =
  | 'research_agent'
  | 'code_agent'
  | 'synthesis_agent'
  | 'bureaucracy_agent'
  | 'etsy_agent'
  | 'funding_agent'
  | 'orchestrator'
  | 'user'
  | string;

export interface BlackboardEvent {
  id: string | number;
  seq: number;
  session_id: string;
  event_type: EventType;
  author: AgentName;
  content: string;
  created_at: string;
  metadata: any;
}

export interface BlackboardEntry {
  id?: string | number;
  session_id?: string;
  [key: string]: any;
}

export function assertVerificationState(state: any): asserts state is VerificationState {
  if (!VERIFICATION_STATES.includes(state)) throw new Error(`Invalid verification state: ${state}`);
}

export interface AgentBid {
  agentName: AgentName;
  confidence: number;
  proposedAction: string;
  expectedOutputShape: string;
  preferredModel?: string;
}

export interface AgentOutput {
  event_type: EventType;
  content: string;
  metadata?: any;
}

export interface OrchestratorTask {
  id?: string;
  sessionId?: string;
  message?: string;
  onProgress?: (event: string, data: any) => void;
  [key: string]: any;
}

export interface OrchestratorResult {
  activeAgent?: string;
  [key: string]: any;
}

export type OrchestratorTermination = 'max_loops' | 'no_bid' | 'synthesis_complete' | 'escalation_required' | string;

export type SupervisorDomain = 'research' | 'code' | 'bureaucracy' | 'funding' | 'etsy' | string;

export interface SupervisorStats {
  totalRuns: number;
  [key: string]: any;
}

export interface SupervisorTask {
  id?: string;
  domain: SupervisorDomain;
  objective: string;
  sessionId: string;
  [key: string]: any;
}

export interface SupervisorResponse {
  status?: string;
  [key: string]: any;
}

export interface Step {
  id?: string;
  action?: string;
  model?: string;
  prompt?: string;
  expected_output_shape?: string;
  [key: string]: any;
}

export interface SupervisorPlan {
  steps: Step[];
  blackboard_updates?: Record<string, any>;
  roi_estimate?: number;
  escalation?: boolean;
  next_supervisor?: string;
  model_sequence?: string[];
  [key: string]: any;
}
