"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuraStateSchema = void 0;
const langgraph_1 = require("@langchain/langgraph");
/**
 * Phase 1: The Ephemeral State-Machine Schema
 *
 * This schema enforces the exact memory separation mapped from the
 * Codex/Claude architectures, replacing the single Blackboard array.
 */
exports.AuraStateSchema = langgraph_1.Annotation.Root({
    // 1. Persistent Knowledge (User queries & Final Synthesized Answers)
    // The reducer safely concatenates messages across multiple turns.
    chatHistory: (0, langgraph_1.Annotation)({
        reducer: (state, update) => state.concat(update),
        default: () => [],
    }),
    // 2. Active Context Window / Ephemeral Scratchpad
    // Raw tool calls, reasoning traces, and filesystem outputs live here.
    // The overwrite reducer allows the Synthesis node to intentionally
    // wipe this clean at the end of a turn to prevent context rot.
    taskWorkspace: (0, langgraph_1.Annotation)({
        reducer: (state, update) => update, // Explicit Overwrite primitive
        default: () => [],
    }),
    // 3. Circuit Breaker Telemetry
    // Tracks consecutive errors to intercept and halt infinite LLM loops.
    errorCount: (0, langgraph_1.Annotation)({
        reducer: (state, update) => state + update,
        default: () => 0,
    }),
    // 3b. Append-only error trace for circuit breaker diagnostics
    errorHistory: (0, langgraph_1.Annotation)({
        reducer: (state, update) => state.concat(update),
        default: () => [],
    }),
    // 4. Graph Execution State
    activeAgent: (0, langgraph_1.Annotation)({
        reducer: (state, update) => update,
        default: () => 'orchestrator',
    }),
});
