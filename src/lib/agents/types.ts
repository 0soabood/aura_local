import { AgentBid, AgentOutput, AgentName, BlackboardEvent } from '../../shared/types';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import type { CallerMessage } from '../providers/UnifiedCaller';
import { assembleSystemPrompt } from '../supervisors/prompts';

export type { AgentBid, AgentOutput };

export interface ReactiveAgent {
  readonly name: AgentName;

  /**
   * Inspect the current event log and return a bid.
   *
   * MUST be synchronous and MUST NOT call any LLM — it is called on every
   * loop iteration for every registered agent.  Use keyword heuristics,
   * event counts, and author checks only.
   *
   * Return confidence = 0 to abstain from this loop iteration.
   */
  evaluate(events: BlackboardEvent[]): AgentBid;

  /**
   * Execute the proposed action and return structured output.
   * The orchestrator appends the result to the blackboard; agents never write
   * directly to the ledger.
   *
   * Throw to signal a hard failure — the orchestrator will append an
   * execution_error event so the next loop's bid phase can respond to it.
   */
  execute(events: BlackboardEvent[], bid: AgentBid): Promise<AgentOutput>;
}

/** All concrete agents receive the shared registry at construction time. */
export abstract class BaseAgent implements ReactiveAgent {
  abstract readonly name: AgentName;

  constructor(protected readonly registry: ProviderRegistry) {}

  abstract evaluate(events: BlackboardEvent[]): AgentBid;
  abstract execute(events: BlackboardEvent[], bid: AgentBid): Promise<AgentOutput>;

  /** Find the first user_message in the log. */
  protected userMessage(events: BlackboardEvent[]): string {
    return events.find(e => e.event_type === 'user_message')?.content ?? '';
  }

  /** Collect content strings from agent_output events by a specific author. */
  protected outputsBy(events: BlackboardEvent[], author: string): string[] {
    return events
      .filter(e => e.event_type === 'agent_output' && e.author === author)
      .map(e => e.content);
  }

  /** True if any execution_error event is present in the log. */
  protected hasErrors(events: BlackboardEvent[]): boolean {
    return events.some(e => e.event_type === 'execution_error');
  }

  /**
   * Build a structured messages array from the full blackboard event log.
   *
   * Maps each event type to the correct role so the model receives a proper
   * multi-turn conversation rather than a single flattened string.
   *
   *   user_message            → user
   *   agent_output / code_written / code_context_retrieved / synthesis_complete
   *                           → assistant  (prefixed with [author] for attribution)
   *   execution_error         → user       (error feedback so the model can self-correct)
   *
   * The caller's systemPrompt is injected first so it governs the entire turn.
   */
  protected buildMessages(
    events: BlackboardEvent[],
    systemPrompt: string,
  ): CallerMessage[] {
    const ASSISTANT_EVENTS = new Set([
      'agent_output', 'code_written', 'code_context_retrieved', 'synthesis_complete',
    ]);

    // assembleSystemPrompt() is the single authority channel: memory first, then
    // the agent-specific base prompt.  One system message, deterministic order.
    const messages: CallerMessage[] = [
      { role: 'system', content: assembleSystemPrompt(systemPrompt) },
    ];

    for (const e of events) {
      if (e.event_type === 'user_message') {
        messages.push({ role: 'user', content: e.content });
      } else if (ASSISTANT_EVENTS.has(e.event_type)) {
        messages.push({ role: 'assistant', content: `[${e.author}]: ${e.content}` });
      } else if (e.event_type === 'execution_error') {
        messages.push({ role: 'user', content: `[system — execution error from ${e.author}]: ${e.content}` });
      }
      // escalation_required and orchestrator meta-events are intentionally skipped.
    }

    return messages;
  }

  /**
   * Returns false when the provider for the given routing string is not
   * registered, preventing a dead provider from winning a bid.
   */
  protected isProviderHealthy(routing: string): boolean {
    const providerId = routing.includes(':') ? routing.slice(0, routing.indexOf(':')) : routing;
    return this.registry.listProviders().includes(providerId);
  }

  /**
   * True if the last `n` recorded attempts (successes + errors) by `agentName`
   * were all execution_errors — signals a stuck agent that should abstain.
   */
  protected consecutiveErrorsBy(
    events: BlackboardEvent[],
    agentName: AgentName,
    n = 2,
  ): boolean {
    const attempts = events.filter(e => {
      if (e.event_type === 'agent_output' && e.author === agentName) return true;
      if (e.event_type === 'execution_error') {
        try { return JSON.parse(e.content)?.agent === agentName; } catch { return false; }
      }
      return false;
    });
    const tail = attempts.slice(-n);
    return tail.length === n && tail.every(e => e.event_type === 'execution_error');
  }
}
