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
});