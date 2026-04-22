/**
 * AURA_LOCAL_SYNC Shared Type Definitions
 */

export type VerificationState = 
  | 'unverified' 
  | 'self_checked' 
  | 'source_checked' 
  | 'accepted' 
  | 'rejected';

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
  created_at: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description?: string;
  priority: number;
  roi_score: number;
  lane: string;
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
}

declare global {
  interface Window {
    aura: AuraAPI;
  }
}
