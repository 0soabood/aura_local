import { ProviderRegistry } from './providers/ProviderRegistry';
import { ReactiveAgent } from './agents/types';
import { ResearchAgent } from './agents/ResearchAgent';
import { CodeAgent } from './agents/CodeAgent';
import { SynthesisAgent } from './agents/SynthesisAgent';
import { ToolRegistry } from './tools/registry';
import { getFileSkeletonDef, getFileSkeletonFn, searchCodebaseDef, searchCodebaseFn } from './context/ContextTools';
import { readFileDef, readFileFn } from './tools/builtin/read_file';
import { listDirectoryDef, listDirectoryFn } from './tools/builtin/list_directory';
import { writeMemoryDef, writeMemoryFn } from './tools/builtin/write_memory';
import { writeFileDef, writeFileFn } from './tools/builtin/write_file';
import { editFileDef, editFileFn } from './tools/builtin/edit_file';
import { runCommandDef, runCommandFn } from './tools/builtin/run_command';
import { BlackboardEventRepository } from '../db/repositories/BlackboardEventRepository';
import { assembleSystemPrompt } from './supervisors/prompts';
import {
  BlackboardEvent,
  AgentBid,
  AgentOutput,
  OrchestratorTask,
  OrchestratorResult,
  OrchestratorTermination,
  EventType,
} from '../shared/types';

// Add to your types or inline here:
export interface OrchestratorTask {
  sessionId: string;
  message: string;
  onProgress?: (event: string, data: any) => void;
}

const MAX_LOOPS = 6;

const WINNER_CONFIDENCE_THRESHOLD = 0.30;

// Pure greeting / meta-identity phrases. Synthesis is allowed to win
// conversationally only when the input matches one of these AND the input is
// short (≤ 30 chars) OR contains one of the identity anchors.
// Anything else — even if it contains "?" — routes to a specialist first.
const SYNTHESIS_GREETING_KEYWORDS = [
  'hello', 'hi', 'hey', 'good morning', 'good evening',
  'what can you do', 'who are you', 'how do you work',
  'what are you', 'your capabilities',
];

// Domain signals that boost research confidence.
const RESEARCH_EXTRA_KEYWORDS = [
  'what is', 'how does', 'why does', 'explain', 'tell me about',
  'who is', 'when did', 'where is', 'compare', 'difference between',
  'pros and cons', 'definition', 'meaning of', 'history of', 'overview',
];

// Domain signals that boost code confidence.
// Deliberately excludes research-overlapping words like 'create', 'write', 'how to'.
const CODE_EXTRA_KEYWORDS = [
  'code', 'function', 'script', 'program', 'implement',
  'build', 'develop', 'debug', 'fix bug', 'error', 'bug',
  'syntax', 'refactor', 'component', 'hook', 'api', 'endpoint',
  'typescript', 'javascript', 'python', 'react', 'node',
  'css', 'html', 'sql', 'json', 'xml',
];

// Words that signal a domain-directed query (research or code).
// Used by the fallback to decide whether to route to the best specialist
// even below threshold, rather than defaulting to synthesis.
const DOMAIN_WORDS = new Set([
  'what', 'how', 'why', 'code', 'write', 'research',
  'find', 'explain', 'build', 'create', 'debug', 'fix',
]);

function isSynthesisGreeting(text: string): boolean {
  const t = text.toLowerCase();
  const hasIdentityAnchor =
    t.includes('what can you') || t.includes('who are you') || t.includes('how do you work');
  if (text.length <= 30) return SYNTHESIS_GREETING_KEYWORDS.some(k => t.includes(k));
  return hasIdentityAnchor;
}

function hasDomainWords(text: string): boolean {
  const t = text.toLowerCase();
  return [...DOMAIN_WORDS].some(w => t.includes(w));
}

/**
 * ReactiveOrchestrator — the v3 Reactive Blackboard engine.
 *
 * Loop per request:
 *   1. Append the user_message to the ledger.
 *   2. Call evaluate() on all agents (synchronous, no LLM).
 *   3. Pick the highest-confidence bid (confidence > 0 required).
 *   4. Call execute() on the winning agent.
 *   5. Append the result; agent controls termination via event_type.
 *   6. Repeat until synthesis_complete | escalation_required | max loops | no bid.
 *
 * Self-healing: if execute() throws, an execution_error event is appended so
 * the next iteration's bid phase can react to it.
 */
export class ReactiveOrchestrator {
  private readonly agents: ReactiveAgent[];
  private readonly registry: ProviderRegistry;

  constructor() {
    this.registry = new ProviderRegistry();

    const toolRegistry = new ToolRegistry()
      .register(getFileSkeletonDef, getFileSkeletonFn)
      .register(searchCodebaseDef,  searchCodebaseFn)
      .register(readFileDef,        readFileFn)
      .register(listDirectoryDef,   listDirectoryFn)
      .register(writeMemoryDef,     writeMemoryFn)
      .register(writeFileDef,       writeFileFn)
      .register(editFileDef,        editFileFn)
      .register(runCommandDef,      runCommandFn);

    this.agents = [
      new ResearchAgent(this.registry, toolRegistry),
      new CodeAgent(this.registry, toolRegistry),
      new SynthesisAgent(this.registry, toolRegistry),
    ];
  }

  async run(task: OrchestratorTask): Promise<OrchestratorResult> {
    const { sessionId, message } = task;
    const start = Date.now();
    let loops = 0;
    let terminationReason: OrchestratorTermination = 'max_loops';

    // Seed the ledger with the user's message.
    BlackboardEventRepository.append(sessionId, 'user_message', 'user', message);

    try { task.onProgress?.('status', { message: 'Orchestrator started...' }); } catch { /* ignore callback errors */ }

    while (loops < MAX_LOOPS) {
      const events = BlackboardEventRepository.findBySession(sessionId);
      const last = events.at(-1);

      // Check for terminal events written by the previous iteration.
      if (
        last?.event_type === 'synthesis_complete' ||
        last?.event_type === 'escalation_required'
      ) {
        terminationReason = last.event_type as OrchestratorTermination;
        break;
      }

      // Fan-out evaluation — synchronous, zero LLM cost.
      const rawBids: AgentBid[] = this.agents.map(a => a.evaluate(events));

      const lastUserMsg = [...events].reverse()
        .find(e => e.event_type === 'user_message')?.content ?? '';

      // --- Synthesis guard ---
      // Synthesis is ONLY allowed to win when:
      //   a) It's a genuine greeting/identity question (conversational fallback), OR
      //   b) A specialist has already produced output AND no specialist has a live bid
      //      above threshold this loop (i.e., it acts as a final formatter, never a competitor).
      const synthIdx = rawBids.findIndex(b => b.agentName === 'synthesis_agent');
      if (synthIdx !== -1) {
        const synthBid = rawBids[synthIdx];
        const specialistOutputExists = events.some(
          e => (e.event_type === 'agent_output' || e.event_type === 'code_written') && e.author !== 'synthesis_agent',
        );
        const specialistBiddingNow = rawBids.some(
          b => b.agentName !== 'synthesis_agent' && b.confidence >= WINNER_CONFIDENCE_THRESHOLD,
        );
        // Allow Mode 1 (0.90) only when a specialist has finished AND no specialist is competing now.
        // Allow Mode 2 (0.40) only for genuine greetings.
        // In all other cases, clamp to 0.
        const allowMode1 = synthBid.confidence >= 0.85 && specialistOutputExists && !specialistBiddingNow;
        const allowMode2 = synthBid.confidence < 0.85 && isSynthesisGreeting(lastUserMsg);
        if (!allowMode1 && !allowMode2) {
          rawBids[synthIdx] = { ...synthBid, confidence: 0 };
        }
      }

      // --- Research boost ---
      // Extend the research regex with the extra keywords this file owns.
      // If the user message matches and research hasn't already run, lift its bid.
      const researchIdx = rawBids.findIndex(b => b.agentName === 'research_agent');
      if (researchIdx !== -1 && rawBids[researchIdx].confidence > 0) {
        const t = lastUserMsg.toLowerCase();
        const hasExtraResearch = RESEARCH_EXTRA_KEYWORDS.some(k => t.includes(k));
        const questionBoost    = (t.includes('?') || /\b(what|how|why)\b/.test(t)) ? 0.1 : 0;
        if (hasExtraResearch || questionBoost > 0) {
          rawBids[researchIdx] = {
            ...rawBids[researchIdx],
            confidence: Math.min(0.90, rawBids[researchIdx].confidence + 0.1 + questionBoost),
          };
        }
      }
      // Research abstained from its own keyword gate but extra keywords match — inject a bid.
      if (researchIdx !== -1 && rawBids[researchIdx].confidence === 0) {
        const t = lastUserMsg.toLowerCase();
        if (RESEARCH_EXTRA_KEYWORDS.some(k => t.includes(k))) {
          rawBids[researchIdx] = {
            ...rawBids[researchIdx],
            confidence: 0.55,
            proposedAction: 'Retrieve information for research-flavoured question',
          };
        }
      }

      // --- Code boost ---
      // Extend code keyword detection with the extra list.
      const codeIdx = rawBids.findIndex(b => b.agentName === 'code_agent');
      if (codeIdx !== -1 && rawBids[codeIdx].confidence === 0) {
        const t = lastUserMsg.toLowerCase();
        if (CODE_EXTRA_KEYWORDS.some(k => t.includes(k))) {
          rawBids[codeIdx] = {
            ...rawBids[codeIdx],
            confidence: 0.55,
            proposedAction: 'Generate or explain code for detected code-related query',
          };
        }
      }

      const aboveThreshold: AgentBid[] = rawBids
        .filter(b => b.confidence >= WINNER_CONFIDENCE_THRESHOLD)
        .sort((a, b) => b.confidence - a.confidence);

      // --- Fallback ---
      let winner: AgentBid;
      if (aboveThreshold.length > 0) {
        winner = aboveThreshold[0];
      } else {
        // No bid cleared the threshold. Decide between:
        //   a) Short / domain-free input → synthesis_agent conversational reply
        //   b) Substantive domain input  → best raw specialist bid (even if weak)
        //   c) All providers down        → escalation_required
        const health = await this.providerHealth().catch(() => ({} as Record<string, boolean>));
        const anyHealthy = Object.values(health).some(Boolean);

        if (!anyHealthy) {
          terminationReason = 'no_bid';
          BlackboardEventRepository.append(
            sessionId,
            'escalation_required',
            'orchestrator',
            JSON.stringify({
              reason: 'All model providers are currently unavailable.',
              actionable:
                'Set at least one of GROQ_API_KEY, GOOGLE_AI_STUDIO_API_KEY, ' +
                'OPENROUTER_API_KEY, MISTRAL_API_KEY, COHERE_API_KEY, or DEEPSEEK_API_KEY ' +
                'and verify the provider endpoint is reachable.',
              provider_health: health,
            }),
          );
          break;
        }

        const isDomainQuery = lastUserMsg.length > 15 && hasDomainWords(lastUserMsg);
        const bestSpecialist = rawBids
          .filter(b => b.agentName !== 'synthesis_agent' && b.confidence > 0)
          .sort((a, b) => b.confidence - a.confidence)[0];

        if (isDomainQuery && bestSpecialist) {
          // Route to the best specialist even below threshold rather than letting
          // synthesis incorrectly answer a research or code question.
          winner = bestSpecialist;
          console.log(
            `[Orchestrator] loop=${loops + 1}  below-threshold specialist pick: ` +
            `${winner.agentName} (${winner.confidence.toFixed(2)})`,
          );
        } else {
          winner = {
            agentName: 'synthesis_agent',
            confidence: 0.25,
            proposedAction: 'Respond conversationally to vague or meta input',
            expectedOutputShape: 'text',
          };
          console.log(
            `[Orchestrator] loop=${loops + 1}  no specialist bid — synthesis conversational fallback.`,
          );
        }
      }

      const winningAgent = this.agents.find(a => a.name === winner.agentName)!;

      console.log(
        `[Orchestrator] loop=${loops + 1}  winner=${winner.agentName}  ` +
        `confidence=${winner.confidence.toFixed(2)}  action="${winner.proposedAction}"`,
      );

      try { task.onProgress?.('agent_update', { agent: winner.agentName, action: winner.proposedAction }); } catch { /* ignore callback errors */ }

      try {
        let output = await winningAgent.execute(events, winner);

        // If synthesis_agent was rate-limited by its primary provider, retry
        // across all available providers (load-sorted) with zero delay.
        if (
          winner.agentName === 'synthesis_agent' &&
          output.event_type === 'escalation_required' &&
          output.metadata?.['rate_limited'] === true
        ) {
          output = await this.callWithFallback(events, winner);
        }

        BlackboardEventRepository.append(
          sessionId,
          output.event_type,
          winner.agentName,
          output.content,
          output.metadata,
        );

        try { task.onProgress?.('agent_complete', { agent: winner.agentName, result: output.content }); } catch { /* ignore callback errors */ }

        // Agent signals termination by choosing a terminal event_type.
        if (
          output.event_type === 'synthesis_complete' ||
          output.event_type === 'escalation_required'
        ) {
          terminationReason = output.event_type as OrchestratorTermination;
          break;
        }
      } catch (err: any) {
        console.error(`[Orchestrator] ${winner.agentName} execute() threw:`, err.message);
        BlackboardEventRepository.append(
          sessionId,
          'execution_error',
          'orchestrator',
          JSON.stringify({
            agent:   winner.agentName,
            error:   err.message,
            loop:    loops + 1,
            bid:     winner,
          }),
        );

        try { task.onProgress?.('error', { message: `Agent ${winner.agentName} encountered an error: ${err.message}` }); } catch { /* ignore callback errors */ }

        // Don't break — let the next loop's bid phase react to the error event.
      }

      loops++;
    }

    const events = BlackboardEventRepository.findBySession(sessionId);
    const finalResponse = this.extractFinalResponse(events);

    return {
      sessionId,
      events,
      finalResponse,
      totalLoops:     loops,
      totalLatencyMs: Date.now() - start,
      terminationReason,
    };
  }

  /** Provider health — delegated to the shared registry */
  async providerHealth(): Promise<Record<string, boolean>> {
    return this.registry.healthCheck();
  }

  /**
   * Retry synthesis across all available providers in load-sorted order.
   * Delegates to ProviderRegistry.callWithFallback() which logs usage,
   * skips on 429/error with zero delay, and logs which provider served.
   */
  private async callWithFallback(
    events: BlackboardEvent[],
    bid: AgentBid,
  ): Promise<AgentOutput> {
    const userMsg = events.find(e => e.event_type === 'user_message')?.content ?? '';
    const agentOutputs = events.filter(e => e.event_type === 'agent_output' || e.event_type === 'code_written');
    const isCodeFocused = /\[Focus:\s*code\]/i.test(userMsg);

    let synthBase =
      'You are a synthesis engine. Combine the agent outputs below into a single, ' +
      'coherent, concise response that directly addresses the user\'s request. ' +
      'Provide the final consolidated answer only — no meta-commentary.';

    if (isCodeFocused) {
      synthBase +=
        '\n\nFor CODE requests: Provide a brief explanation, ONE main code example — ' +
        'no redundant variations. Do NOT write long encyclopedic overviews.';
    }

    const prompt =
      agentOutputs.length === 0
        ? userMsg
        : `User's request: ${userMsg}\n\n` +
          `Agent outputs:\n${agentOutputs.map(e => `--- Specialist Output ---\n${e.content}`).join('\n\n')}`;

    try {
      const result = await this.registry.callWithFallback(prompt, {
        temperature: 0.3,
        systemPrompt: assembleSystemPrompt(synthBase),
      });

      return {
        event_type: 'synthesis_complete',
        content: result.text,
        metadata: {
          model_id:   result.model,
          provider:   result.provider,
          latency_ms: result.latencyMs,
          confidence: bid.confidence,
          mode:       agentOutputs.length > 0 ? 'synthesis' : 'conversational',
          skipped:    result.skipped,
        },
      };
    } catch (err: any) {
      console.error(`[Orchestrator] All providers failed: ${err.message}`);
      return {
        event_type: 'escalation_required',
        content: JSON.stringify({
          reason: 'All available providers failed during synthesis fallback.',
          actionable:
            'Check that at least one of GROQ_API_KEY, GOOGLE_AI_STUDIO_API_KEY, ' +
            'OPENROUTER_API_KEY, MISTRAL_API_KEY, COHERE_API_KEY, or DEEPSEEK_API_KEY ' +
            'is set and that the provider is not rate-limited. Retry once a provider is available.',
          error: err.message,
        }),
        metadata: { confidence: bid.confidence },
      };
    }
  }

  /**
   * Walk events newest-first looking for a terminal event, then any
   * agent_output. Falls back to a safe explicit error if nothing exists.
   */
  private extractFinalResponse(events: BlackboardEvent[]): string {
    // Strip [agent_name]: prefix lines injected into specialist outputs before synthesis.
    const stripAgentTags = (text: string): string =>
      text.replace(/^\[[a-z_]+\]:\s*\n?/gm, '').trim();

    // 1. Prefer explicit terminal state
    const terminalTypes: EventType[] = ['synthesis_complete', 'escalation_required'];
    const terminal = [...events].reverse().find(e => terminalTypes.includes(e.event_type));
    if (terminal && terminal.content.trim()) return stripAgentTags(terminal.content);

    // 2. Fall back to the last substantive specialist output (e.g. if max loops was hit)
    const specialistTypes: EventType[] = ['agent_output', 'code_written', 'execution_error'];
    const lastSpecialist = [...events].reverse().find(e => specialistTypes.includes(e.event_type) && e.author !== 'user');
    if (lastSpecialist && lastSpecialist.content.trim()) return stripAgentTags(lastSpecialist.content);

    // 3. Safe explicit fallback (never echo the user's input)
    return 'No final response generated.';
  }
}
