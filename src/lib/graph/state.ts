import { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';

/**
 * Phase 1: The Ephemeral State-Machine Schema
 *
 * This schema enforces the exact memory separation mapped from the
 * Codex/Claude architectures, replacing the single Blackboard array.
 */
export const AuraStateSchema = Annotation.Root({
  // 1. Persistent Knowledge (User queries & Final Synthesized Answers)
  // The reducer safely concatenates messages across multiple turns.
  chatHistory: Annotation<BaseMessage[]>({
    reducer: (state, update) => state.concat(update),
    default: () => [],
  }),

  // 2. Active Context Window / Ephemeral Scratchpad
  // Raw tool calls, reasoning traces, and filesystem outputs live here.
  // The overwrite reducer allows the Synthesis node to intentionally
  // wipe this clean at the end of a turn to prevent context rot.
  taskWorkspace: Annotation<BaseMessage[]>({
    reducer: (state, update) => update, // Explicit Overwrite primitive
    default: () => [],
  }),

  // 3. Circuit Breaker Telemetry
  // Tracks consecutive errors to intercept and halt infinite LLM loops.
  errorCount: Annotation<number>({
    reducer: (state, update) => state + update,
    default: () => 0,
  }),

  // 3b. Append-only error trace for circuit breaker diagnostics
  errorHistory: Annotation<string[]>({
    reducer: (state, update) => state.concat(update),
    default: () => [],
  }),

  // 4. Graph Execution State
  activeAgent: Annotation<string>({
    reducer: (state, update) => update,
    default: () => 'orchestrator',
  }),

  // 5. User-selected model override (optional)
  // When provided, the synthesis node will use this model instead of the default.
  preferredModel: Annotation<string>({
    reducer: (state, update) => update,
    default: () => '',
  }),

  // 5b. Per-Role Model Configuration (from Zustand store)
  // Maps role names to model IDs (e.g., 'daily_driver' -> 'google:gemini-2.5-flash')
  modelConfig: Annotation<Record<string, string>>({
    reducer: (state, update) => ({ ...state, ...update }),
    default: () => ({}),
  }),

  // 5c. Per-Agent Model Overrides (from Zustand store)
  // Maps agent names to model IDs (e.g., 'CodeAgent' -> 'vertex:gemini-2.5-pro')
  agentModelOverrides: Annotation<Record<string, string>>({
    reducer: (state, update) => ({ ...state, ...update }),
    default: () => ({}),
  }),

  // 6. Session ID for debug broadcasting
  // Used to route WebSocket debug events to the correct session clients.
  sessionId: Annotation<string>({
    reducer: (state, update) => update,
    default: () => '',
  }),

  // 7. Energy mode (optional)
  // 'low' = concise responses, 'high' = detailed responses
  energyMode: Annotation<string>({
    reducer: (state, update) => update,
    default: () => 'high',
  }),
});