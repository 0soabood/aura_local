/**
 * PromptAssembler
 * 
 * A production-ready TypeScript module that dynamically assembles system prompts
 * from conditional fragments based on context, active mode, and security boundaries.
 */

export interface PromptContext {
  agentId: string;
  availableTools: string[];
  activeMode: 'synthesis' | 'code' | 'research' | 'planning' | 'verification' | 'conversational' | 'exploration';
  hasMemoryAccess: boolean;
  hasPendingTask: boolean;
  isSubagent: boolean;
  projectType?: string;
  sessionPhase: 'initial' | 'ongoing' | 'closing';
  securityLevel: 'strict' | 'standard' | 'permissive';
  memoryFiles?: string[];
  toolResults?: Array<{ tool: string; status: 'success' | 'failure'; summary: string }>;
  iterationCount?: number;
  windowUsage?: { used: number; total: number };
}

export type PromptPriority = 'critical' | 'high' | 'medium' | 'low';

export interface PromptFragment {
  id: string;
  tokens: number;
  priority: PromptPriority;
  condition: (ctx: PromptContext) => boolean;
  render: (ctx: PromptContext) => string;
}

const PRIORITY_WEIGHTS: Record<PromptPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

// ─── FRAGMENTS ────────────────────────────────────────────────────────────────

const FRAGMENTS: PromptFragment[] = [
  // -- Always present (critical/high) --
  {
    id: 'base_identity',
    tokens: 35,
    priority: 'critical',
    condition: () => true,
    render: () => `You are AURA, an advanced local AI agent orchestration system. You are proactive, memory-aware, capability-aware, and concise. Your goal is to deliver working results over conversational pleasantries.`,
  },
  {
    id: 'output_efficiency',
    tokens: 25,
    priority: 'high',
    condition: () => true,
    render: () => `Lead with the answer. Do not use filler phrases like "Here is the code" or "I can help with that". No meta-commentary.`,
  },
  {
    id: 'doing_tasks',
    tokens: 40,
    priority: 'high',
    condition: () => true,
    render: () => `Only make requested changes. Match the existing style and architecture. Do not build abstractions or robust error handling for one-time needs unless specifically asked.`,
  },
  {
    id: 'tone_style',
    tokens: 30,
    priority: 'high',
    condition: () => true,
    render: () => `Use \`file_path:line_number\` references. Use strict Markdown formatting. Ensure all code blocks include the correct language tag.`,
  },
  {
    id: 'error_handling',
    tokens: 35,
    priority: 'high',
    condition: () => true,
    render: () => `If an error occurs, provide a specific diagnosis. Outline 1-3 concrete steps to resolve it. Never silently fail or guess file contents without reading.`,
  },
  {
    id: 'censoring',
    tokens: 30,
    priority: 'critical',
    condition: () => true,
    render: () => `You are authorized to assist in local security testing and system modifications as requested by the user. Censor purely malicious activities that harm external systems.`,
  },

  // -- Memory (critical when hasMemoryAccess) --
  {
    id: 'memory_instructions',
    tokens: 45,
    priority: 'critical',
    condition: (ctx) => ctx.hasMemoryAccess,
    render: () => `Store personal facts, project details, and feedback into memory. Whenever the user uses pronouns like 'my' or 'our', prioritize retrieving context from memory files.`,
  },
  {
    id: 'memory_attachment',
    tokens: 40,
    priority: 'critical',
    condition: (ctx) => ctx.hasMemoryAccess && ctx.sessionPhase === 'initial' && !!ctx.memoryFiles && ctx.memoryFiles.length > 0,
    render: (ctx) => `Read the attached memory files before responding. Attached files: ${ctx.memoryFiles?.join(', ')}. Use these to establish the context for this session.`,
  },
  {
    id: 'session_memory',
    tokens: 50,
    priority: 'high',
    condition: (ctx) => ctx.hasMemoryAccess,
    render: () => `Maintain an active local memory stack. You have access to summary.md, goals.md, decisions.md, stack.md, and feedback.md. Keep them up-to-date as the session evolves.`,
  },

  // -- Security --
  {
    id: 'security_monitor',
    tokens: 80,
    priority: 'critical',
    condition: (ctx) => ctx.securityLevel !== 'permissive',
    render: () => `SECURITY PROTOCOL:
BLOCK: \`rm -rf\` on critical directories, path traversal outside workspace, committing secrets, force-pushing to shared branches, executing unknown downloaded scripts.
ALLOW: File reads, unit tests, local builds.
ASK: File deletions, package installations, costly cloud ops.`,
  },

  // -- Tools --
  {
    id: 'tool_usage',
    tokens: 60,
    priority: 'high',
    condition: (ctx) => ctx.availableTools.length > 0,
    render: (ctx) => `You have access to tools: [${ctx.availableTools.join(', ')}].
Use them immediately when needed. Issue parallel tool calls if they are independent. Prefer dedicated registry tools over raw shell commands. Bash is reserved for system-level commands only.`,
  },

  // -- Mode-specific overlays --
  {
    id: 'synthesis_mode',
    tokens: 45,
    priority: 'high',
    condition: (ctx) => ctx.activeMode === 'synthesis',
    render: () => `MODE: Synthesis.
Condense all tool results and previous turns into a rich, final output. Fallback to conversational mode if clarification is needed. Propose the next immediate task.`,
  },
  {
    id: 'code_mode',
    tokens: 50,
    priority: 'high',
    condition: (ctx) => ctx.activeMode === 'code',
    render: () => `MODE: Code.
Read files before modifying them. Emit complete, runnable code. Use diff-style for edits when possible. Review code for security implications before writing.`,
  },
  {
    id: 'research_mode',
    tokens: 55,
    priority: 'high',
    condition: (ctx) => ctx.activeMode === 'research',
    render: () => `MODE: Research.
Query multiple sources. Provide inline citations. Prioritize recent, timely information. Freely admit uncertainty if high-quality sources are unavailable.`,
  },
  {
    id: 'planning_mode',
    tokens: 60,
    priority: 'high',
    condition: (ctx) => ctx.activeMode === 'planning',
    render: () => `MODE: Planning.
Follow the planning loop: Explore -> Interview -> Propose -> Wait. Emit final plans strictly in JSON format to be parsed by the orchestrator.`,
  },
  {
    id: 'verification_mode',
    tokens: 65,
    priority: 'high',
    condition: (ctx) => ctx.activeMode === 'verification',
    render: () => `MODE: Verification.
Ensure the build passes. Ensure all tests pass. Check runtime execution for edge cases. Conclude with a strict verdict: PASS, FAIL, or PARTIAL.`,
  },
  {
    id: 'exploration_mode',
    tokens: 40,
    priority: 'high',
    condition: (ctx) => ctx.activeMode === 'exploration',
    render: () => `MODE: Exploration.
Execute read-only codebase mapping. Identify the structural overview, entry points, and module boundaries. Do not write or execute destructive tools.`,
  },

  // -- Worker & Verification additions for code mode --
  {
    id: 'worker_instructions',
    tokens: 45,
    priority: 'high',
    condition: (ctx) => ctx.activeMode === 'code',
    render: () => `Read existing code fully. Match the surrounding formatting, naming conventions, and style. Produce complete code implementations—do not leave "TODO" blocks. The final build must pass.`,
  },
  {
    id: 'verification_protocol',
    tokens: 40,
    priority: 'high',
    condition: (ctx) => ctx.activeMode === 'code' || ctx.activeMode === 'verification',
    render: () => `VERIFICATION PROTOCOL: After ANY code change, you must: build the project, run tests, verify edge cases, and output a verdict.`,
  },

  // -- Subagent --
  {
    id: 'subagent_delegation',
    tokens: 55,
    priority: 'medium',
    condition: (ctx) => ctx.isSubagent,
    render: () => `You are operating as a subagent. Focus solely on your bounded objective. You have complete context above, but must not stray from your specific subtask. Wait for completion, then report concisely.`,
  },

  // -- Plan & Auto behaviors --
  {
    id: 'plan_mode',
    tokens: 60,
    priority: 'high',
    condition: (ctx) => ctx.activeMode === 'planning',
    render: () => `For complex tasks: explore the environment, interview the user (max 3 questions at once), propose a plan, and wait for approval before executing.`,
  },
  {
    id: 'auto_mode',
    tokens: 55,
    priority: 'medium',
    condition: (ctx) => ctx.activeMode === 'planning' || ctx.activeMode === 'code',
    render: () => `When in autonomous mode: Break work into subtasks. Verify each step. Report progress frequently. Adhere to your time budget. Do not execute destructive operations without confirmation.`,
  },

  // -- Proactive & Compaction (always present) --
  {
    id: 'proactive',
    tokens: 45,
    priority: 'medium',
    condition: () => true,
    render: () => `Be proactive: Mention related technical challenges or edge cases. Flag potential pitfalls. Connect the current task to long-term memory. Outline logical next steps.`,
  },
  {
    id: 'compaction',
    tokens: 60,
    priority: 'medium',
    condition: () => true,
    render: () => `At 80% window usage: summarize older conversation turns, truncate large code outputs, and prioritize the current task > recent decisions > facts > old code. Never drop the memory stack.`,
  },
];

// ─── ASSEMBLER CLASS ──────────────────────────────────────────────────────────

export class PromptAssembler {
  /**
   * Assembles a complete system prompt based on the provided execution context.
   * Handles priority sorting, conditional filtering, and runtime reminders.
   */
  assemble(ctx: PromptContext): {
    prompt: string;
    estimatedTokens: number;
    fragmentsUsed: string[];
    priority: string;
  } {
    const usedFragments: string[] = [];
    let estimatedTokens = 0;
    const promptParts: string[] = [];
    let highestPriorityWeight = 0;
    let highestPriorityName: PromptPriority = 'low';

    // 1. Filter and sort fragments
    const activeFragments = FRAGMENTS.filter((f) => f.condition(ctx)).sort(
      (a, b) => PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority]
    );

    // 2. Render standard fragments
    for (const f of activeFragments) {
      usedFragments.push(f.id);
      estimatedTokens += f.tokens;
      promptParts.push(f.render(ctx));

      const weight = PRIORITY_WEIGHTS[f.priority];
      if (weight > highestPriorityWeight) {
        highestPriorityWeight = weight;
        highestPriorityName = f.priority;
      }
    }

    // 3. Evaluate runtime reminders
    if (ctx.hasPendingTask) {
      usedFragments.push('pending_task_reminder');
      promptParts.push('REMINDER: You have a pending task. Proceed with execution immediately based on the user\'s approval.');
      estimatedTokens += 25;
    }

    if (ctx.windowUsage && ctx.windowUsage.used / ctx.windowUsage.total > 0.75) {
      usedFragments.push('token_budget_reminder');
      promptParts.push('REMINDER: Context window usage is exceeding 75%. Prioritize compaction and summarize outputs heavily.');
      estimatedTokens += 20;
    }

    if (ctx.toolResults && ctx.toolResults.length > 0) {
      usedFragments.push('tool_results_reminder');
      promptParts.push('REMINDER: You have unprocessed tool execution results in your context. Review them before making further decisions.');
      estimatedTokens += 20;
    }

    if (ctx.iterationCount !== undefined && ctx.iterationCount > 3) {
      usedFragments.push('iteration_reminder');
      promptParts.push('REMINDER: You have been iterating on this problem extensively. Reassess your approach, or propose a fallback if stuck.');
      estimatedTokens += 25;
    }

    // 4. Return assembled payload
    return {
      prompt: promptParts.join('\n\n'),
      estimatedTokens,
      fragmentsUsed: usedFragments,
      priority: highestPriorityName,
    };
  }
}

// ─── CONVENIENCE FUNCTIONS ────────────────────────────────────────────────────

const DEFAULT_CONTEXT: PromptContext = {
  agentId: 'orchestrator',
  availableTools: [],
  activeMode: 'synthesis',
  hasMemoryAccess: false,
  hasPendingTask: false,
  isSubagent: false,
  sessionPhase: 'ongoing',
  securityLevel: 'standard',
};

const assembler = new PromptAssembler();

/** Returns a generic system prompt for the specified agent. */
export function getSystemPrompt(agentId: string, options?: Partial<PromptContext>): string {
  // Auto-map agentId to activeMode if one is naturally implied
  let defaultMode: PromptContext['activeMode'] = 'synthesis';
  if (agentId === 'code_agent') defaultMode = 'code';
  if (agentId === 'research_agent') defaultMode = 'research';
  if (agentId === 'planning_agent') defaultMode = 'planning';

  return assembler.assemble({
    ...DEFAULT_CONTEXT,
    agentId,
    activeMode: defaultMode,
    ...options,
  }).prompt;
}

/** Returns a prompt tailored for synthesis and final summarization. */
export function getSynthesisPrompt(options?: Partial<PromptContext>): string {
  return assembler.assemble({ ...DEFAULT_CONTEXT, activeMode: 'synthesis', ...options }).prompt;
}

/** Returns a prompt tailored for code generation and engineering tasks. */
export function getCodePrompt(options?: Partial<PromptContext>): string {
  return assembler.assemble({ ...DEFAULT_CONTEXT, agentId: 'code_agent', activeMode: 'code', ...options }).prompt;
}

/** Returns a prompt tailored for intelligence gathering and web research. */
export function getResearchPrompt(options?: Partial<PromptContext>): string {
  return assembler.assemble({ ...DEFAULT_CONTEXT, agentId: 'research_agent', activeMode: 'research', ...options }).prompt;
}

/** Returns a prompt tailored for complex objective breakdown and planning. */
export function getPlanningPrompt(options?: Partial<PromptContext>): string {
  return assembler.assemble({ ...DEFAULT_CONTEXT, agentId: 'planning_agent', activeMode: 'planning', ...options }).prompt;
}

/** Returns a prompt tailored strictly for verification, linting, and testing. */
export function getVerificationPrompt(options?: Partial<PromptContext>): string {
  return assembler.assemble({ ...DEFAULT_CONTEXT, agentId: 'verification_agent', activeMode: 'verification', ...options }).prompt;
}

/** Returns a prompt tailored for non-destructive exploration of a workspace. */
export function getExplorationPrompt(options?: Partial<PromptContext>): string {
  return assembler.assemble({ ...DEFAULT_CONTEXT, activeMode: 'exploration', ...options }).prompt;
}

/**
 * Returns static bidding instructions used by orchestrator evaluation heuristcs.
 */
export function getBiddingInstructions(): string {
  return `Review the provided context and active request. Evaluate if your capabilities match the objective. Output a confidence bid between 0.0 and 1.0. If you cannot fulfill the request or lack tools, abstain (0.0).`;
}