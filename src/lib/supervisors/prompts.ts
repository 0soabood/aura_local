import { SupervisorDomain } from '../../shared/types';
import { getAuraMemory } from '../memory/loader';
import { peekModel, type ModelRole } from '../ModelConfig';

export interface DomainConfig {
  name: string;
  supervisorRouting: string;   // "provider:model" for the planner call
  workerRoutings: string[];    // available workers listed in the prompt
  systemHint: string;          // domain-specific behaviour hint injected into the prompt
  fallbackRole: ModelRole;
}

/**
 * Single authoritative helper for building a system prompt.
 *
 * Rule: memory (SOUL + USER + AGENTS) ALWAYS comes first so it cannot be
 * diluted by later instructions.  The base prompt follows, separated by a
 * ruled divider so the model sees a clear authority hierarchy:
 *
 *   [1] AURA Memory (highest authority — identity, user prefs, agent config)
 *   [---]
 *   [2] base / route / agent instructions
 *
 * Callers never need to touch getAuraMemory() directly — this helper is the
 * only place memory is woven into a system prompt.
 */
export function assembleSystemPrompt(base: string): string {
  let memoryContext = '';
  try {
    memoryContext = getAuraMemory().combinedSystemContext ?? '';
  } catch {
    // Memory not yet initialized (test harness / cold start) — degrade gracefully.
  }

  const timeContext = `Current time: ${new Date().toString()}`;

  if (!memoryContext) return `${timeContext}\n\n${base}`;
  const memoryInstruction = `[SYSTEM MEMORY INJECTED]\nYou are equipped with persistent memory. The context below contains the user's profile, active goals, and past session summaries.\nNEVER claim you do not have memory, personal goals, or access to past conversations. Always use this context to answer accurately.`;
  return `${memoryInstruction}\n\n${memoryContext}\n\n---\n\n${timeContext}\n\n${base}`;
}

/**
 * Domain config table.
 *
 * supervisorRouting uses Gemini as the universal planner since it's already
 * configured.  Worker routings list the best available model per capability;
 * the router will skip any whose provider key is missing and fall back to Gemini.
 */
export const DOMAIN_CONFIG: Record<SupervisorDomain, DomainConfig> = {
  research: {
    name: 'Research Supervisor',
    supervisorRouting: peekModel('agent_orchestrator'),
    workerRoutings: [
      'codex:o4-mini',                 // code-assisted retrieval & analysis (requires codex CLI + OPENAI_API_KEY)
      'groq:llama-3.3-70b-versatile',  // synthesis & reasoning fallback
      peekModel('daily_driver'),
      peekModel('long_context'),
      peekModel('reasoning'),
    ],
    fallbackRole: 'daily_driver',
    systemHint:
      'Focus on retrieving verifiable facts, market signals, and synthesising them into actionable intelligence. ' +
      'Prefer the codex worker for structured analysis and groq for synthesis.',
  },
  code: {
    name: 'Code Supervisor',
    supervisorRouting: peekModel('agent_orchestrator'),
    workerRoutings: [
      'groq:qwen-2.5-coder-32b',      // code generation & debugging
      'groq:llama-3.3-70b-versatile', // explanation & review
      peekModel('daily_driver'),
      peekModel('reasoning'),
    ],
    fallbackRole: 'daily_driver',
    systemHint:
      'Focus on producing correct, runnable code. ' +
      'Prefer the groq:qwen-2.5-coder-32b worker for generation and groq:llama-3.3-70b-versatile for review/explanation.',
  },
  planning: {
    name: 'Planning Supervisor',
    supervisorRouting: peekModel('agent_orchestrator'),
    workerRoutings: [
      'groq:llama-3.3-70b-versatile', // strategic decomposition
      'groq:llama-3.1-8b-instant',    // fast auxiliary steps
      peekModel('reasoning'),
      peekModel('bulk_fast'),
    ],
    fallbackRole: 'bulk_fast',
    systemHint:
      'Focus on breaking objectives into concrete, prioritised steps. ' +
      'Prefer groq:llama-3.3-70b-versatile for strategic reasoning and groq:llama-3.1-8b-instant for fast auxiliary steps.',
  },
};

/** Template for the supervisor planning call (returns JSON) */
export function buildSupervisorPrompt(
  config: DomainConfig,
  objective: string,
  context: Record<string, unknown>,
): string {
  const contextStr = Object.keys(context).length > 0
    ? JSON.stringify(context, null, 2)
    : '(empty — first run in this session)';

  return `You are the ${config.name} for AURA_LOCAL_SYNC v2.

${config.systemHint}

Available workers: ${config.workerRoutings.join(', ')}

## Input
Objective: ${objective}

Blackboard context:
${contextStr}

## Instructions
Return ONLY valid JSON matching this exact schema — no markdown, no prose:

{
  "model_sequence": ["routing1", "routing2"],
  "reasoning": "<why this sequence — max 50 words>",
  "steps": [
    {
      "model": "<provider:model-id from available workers>",
      "prompt": "<exact prompt to send to this model>",
      "expected_output_shape": "<json|text|code>"
    }
  ],
  "blackboard_updates": {
    "<key>": "<value to persist for future runs>"
  },
  "escalation": false,
  "escalation_reason": null,
  "next_supervisor": null,
  "roi_estimate": 5
}

Escalation rules — set escalation=true only if:
- The objective genuinely requires coordination across research + code + planning
- Worker outputs are contradictory and require a tie-break
- Verification of the result needs a different domain's expertise

Limit steps to 3 maximum. roi_estimate is 0 (no value) to 10 (high value).`;
}

/** Keyword-based domain classifier — fast, zero-latency, no extra API call */
export function classifyDomain(text: string): SupervisorDomain {
  const t = text.toLowerCase();

  const codeScore = [
    /\b(code|function|class|script|implement|debug|refactor|build|api|endpoint|test|deploy|bug|fix|parse|regex|sql|query)\b/,
  ].filter(r => r.test(t)).length;

  const planScore = [
    /\b(plan|roadmap|strategy|goal|milestone|break.?down|decompose|prioritize|sprint|task|schedule|timeline|objective)\b/,
  ].filter(r => r.test(t)).length;

  const researchScore = [
    /\b(research|market|analyze|analyse|find|search|trend|intel|report|survey|compare|benchmark|news|data|price)\b/,
  ].filter(r => r.test(t)).length;

  const scores: [SupervisorDomain, number][] = [
    ['code',     codeScore],
    ['planning', planScore],
    ['research', researchScore],
  ];

  scores.sort((a, b) => b[1] - a[1]);

  // If top score is 0 or tied — default to research (general purpose)
  return scores[0][1] > 0 ? scores[0][0] : 'research';
}
