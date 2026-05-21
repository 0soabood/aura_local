import { AgentBid, AgentOutput, AgentName, BlackboardEvent } from '../../shared/types';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import type { CallerMessage } from '../providers/UnifiedCaller';
import { assembleSystemPrompt } from '../supervisors/prompts';
import type { ToolDefinition, ReActResult } from '../tools/types';
import type { ToolRegistry } from '../tools/registry';
import { broadcastEvent } from '../debug';

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

  /**
   * Maximum ReAct loop iterations before forcing a final answer.
   * Override in subclasses to set agent-specific limits (e.g. 10 for ResearchAgent).
   */
  protected maxIterations = 5;

  constructor(
    protected readonly registry: ProviderRegistry,
    protected readonly toolRegistry?: ToolRegistry,
  ) {}

  abstract evaluate(events: BlackboardEvent[]): AgentBid;
  abstract execute(events: BlackboardEvent[], bid: AgentBid): Promise<AgentOutput>;

  /** Find the first user_message in the log. */
  protected userMessage(events: BlackboardEvent[]): string {
    return [...events].reverse().find(e => e.event_type === 'user_message')?.content ?? '';
  }

  /** Collect content strings from agent_output events by a specific author. */
  protected outputsBy(events: BlackboardEvent[], author: string): string[] {
    // Isolate to the current turn to prevent agents from thinking they've already run
    // for a new follow-up request.
    const reversedUserMsgIdx = [...events].reverse().findIndex(e => e.event_type === 'user_message');
    const lastUserIdx = reversedUserMsgIdx >= 0 ? events.length - 1 - reversedUserMsgIdx : 0;
    const currentTurn = events.slice(lastUserIdx);

    return currentTurn
      .filter(e => (e.event_type === 'agent_output' || e.event_type === 'code_written') && e.author === author)
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
    // Find where the current turn starts
    const reversedUserMsgIdx = [...events].reverse().findIndex(e => e.event_type === 'user_message');
    const lastUserMsgIdx = reversedUserMsgIdx >= 0 ? events.length - 1 - reversedUserMsgIdx : 0;

    // assembleSystemPrompt() is the single authority channel: memory first, then
    // the agent-specific base prompt.  One system message, deterministic order.
    const messages: CallerMessage[] = [
      { role: 'system', content: assembleSystemPrompt(systemPrompt) },
    ];

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const isCurrentTurn = i >= lastUserMsgIdx;

      if (e.event_type === 'user_message') {
        messages.push({ role: 'user', content: e.content });
      } else if (e.event_type === 'synthesis_complete') {
        messages.push({ role: 'assistant', content: e.content });
      } else if (isCurrentTurn && (e.event_type === 'agent_output' || e.event_type === 'code_written')) {
        messages.push({ role: 'assistant', content: `[${e.author}]: ${e.content}` });
      } else if (isCurrentTurn && e.event_type === 'code_context_retrieved') {
        // Pseudo-vector context: inject as a system note so the LLM can read it
        // but it's clearly marked as internal — not part of the conversation.
        messages.push({
          role: 'system',
          content: `[INTERNAL CONTEXT — DO NOT OUTPUT THIS IN YOUR RESPONSE]:\n${e.content}`,
        });
      } else if (isCurrentTurn && e.event_type === 'execution_error') {
        messages.push({ role: 'user', content: `[system — execution error from ${e.author}]: ${e.content}` });
      }
      // escalation_required and orchestrator meta-events are intentionally skipped.
    }

    return messages;
  }

  /**
   * Returns true only when the provider is registered AND has an API key set.
   * Uses getAvailableProviders() which filters by env key presence.
   */
  protected isProviderHealthy(routing: string): boolean {
    const providerId = routing.includes(':') ? routing.slice(0, routing.indexOf(':')) : routing;
    return this.registry.getAvailableProviders().some(cfg => cfg.id === providerId);
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

  /**
   * Bounded ReAct loop: Reason → Act → Observe, up to this.maxIterations times.
   *
   * On each step the LLM is called with the current message history and the
   * provided tool definitions. If the LLM produces tool calls, each is
   * executed via the registry and the results are appended to the conversation
   * before the next step. The loop exits when the LLM produces a response with
   * no tool calls, or when this.maxIterations is reached (forcing a final answer).
   *
   * Tool results are injected in the OpenAI tool-message format so that
   * OpenAI-compatible providers (Groq, OpenRouter, etc.) maintain a valid
   * conversation structure; other providers handle them as text.
   */
  protected async runReactLoop(
    sessionId: string,
    messages: CallerMessage[],
    model: string,
    toolDefs: ToolDefinition[],
    toolRegistry: ToolRegistry,
    opts: { temperature?: number } = {},
  ): Promise<ReActResult> {
    const localMessages: CallerMessage[] = [...messages];
    let totalTokensIn  = 0;
    let totalTokensOut = 0;
    let totalLatency   = 0;
    let lastModel      = model;

    for (let step = 0; step < this.maxIterations; step++) {
      broadcastEvent(sessionId, { event_type: 'react_think', author: this.name, content: `Reasoning step ${step + 1}/${this.maxIterations} with ${model}...` });

      let result = await this.registry.call(model, '', {
        temperature: opts.temperature,
        messages:    localMessages,
        tools:       toolDefs.length ? toolDefs : undefined,
      });

      if (result.rateLimited) {
        // Primary provider can't handle this request (rate limit or token size).
        // Try all other available providers in load-sorted order.
        const fallback = await this.registry.callWithFallback('', {
          temperature: opts.temperature,
          messages:    localMessages,
          tools:       toolDefs.length ? toolDefs : undefined,
        });
        if (!fallback.rateLimited && fallback.text) {
          result = fallback;
        } else {
          throw new Error(
            `[${model}] token/rate limit exceeded and all fallbacks failed: ` +
            (result.errorMessage ?? fallback.errorMessage ?? 'no providers available'),
          );
        }
      }

      totalTokensIn  += result.tokensIn;
      totalTokensOut += result.tokensOut;
      totalLatency   += result.latencyMs;
      lastModel       = result.model;

      // Verbose thinking trace — the actual LLM reasoning text before any tool call decision
      if (result.text?.length > 10) {
        broadcastEvent(sessionId, {
          event_type: 'react_verbose',
          author: this.name,
          content: result.text,
          metadata: {
            step: step + 1,
            maxIterations: this.maxIterations,
            model: lastModel,
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            latencyMs: result.latencyMs,
          },
        });
      }

      if (!result.toolCalls?.length) {
        broadcastEvent(sessionId, { event_type: 'react_observe', author: this.name, content: `Final answer generated.` });
        return {
          content:    result.text,
          model:      lastModel,
          latencyMs:  totalLatency,
          tokensIn:   totalTokensIn,
          tokensOut:  totalTokensOut,
        };
      }

      broadcastEvent(sessionId, { event_type: 'react_act', author: this.name, content: `Calling ${result.toolCalls.length} tool(s)` });

      // Append the assistant's tool-call intent (preserves OpenAI protocol).
      localMessages.push({
        role:       'assistant',
        content:    '',
        tool_calls: result.toolCalls,
      } as any);

      // Execute each tool call and append the result as a tool message.
      for (const tc of result.toolCalls) {
        let toolArgs: Record<string, unknown>;
        try {
          toolArgs = typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : (tc.function.arguments ?? {});
        } catch {
          toolArgs = {};
        }

        broadcastEvent(sessionId, { event_type: 'react_act', author: this.name, content: `Executing tool: ${tc.function?.name}` });

        // Verbose tool call — show the actual arguments passed to the tool
        const argCount = Object.keys(toolArgs).length;
        if (argCount > 0) {
          broadcastEvent(sessionId, {
            event_type: 'react_verbose',
            author: this.name,
            content: `[tool:${tc.function?.name}] args: ${JSON.stringify(toolArgs).slice(0, 500)}`,
            metadata: { toolName: tc.function?.name, toolArgs, step: step + 1 },
          });
        }

        const toolResult = await toolRegistry.execute({
          id:        tc.id ?? `tool_${step}_${tc.function?.name}`,
          name:      tc.function?.name,
          arguments: toolArgs,
        });

        broadcastEvent(sessionId, { event_type: 'react_observe', author: this.name, content: `Tool ${tc.function?.name} completed.` });

        localMessages.push({
          role:       'tool',
          content:    String(toolResult),
          tool_call_id: tc.id ?? `tool_${step}_${tc.function?.name}`,
          name:       tc.function?.name,
        } as any);
      }
    }

    console.log(`[ReAct] maxIterations (${this.maxIterations}) hit for ${this.name}. localMessages count: ${localMessages.length}. Forcing final answer...`);
    broadcastEvent(sessionId, { event_type: 'react_observe', author: this.name, content: `Max reasoning steps reached. Forcing final answer...` });

    // Force one more LLM call without tools to get a final answer
    try {
      const finalResult = await this.registry.call(lastModel, 'Force final answer after max ReAct steps', {
        temperature: opts.temperature ?? 0.3,
        messages: [...localMessages, {
          role: 'user',
          content: 'You have reached the maximum number of reasoning steps. Provide your final answer now based on all the information gathered. Do NOT call any more tools. Give the best answer you can.'
        }],
      });

      // Validate the response: must be a non-empty string with actual content
      const responseText = (finalResult.text || '').trim();
      if (responseText && responseText.length > 5) {
        totalTokensIn  += finalResult.tokensIn;
        totalTokensOut += finalResult.tokensOut;
        totalLatency   += finalResult.latencyMs;

        broadcastEvent(sessionId, { event_type: 'react_observe', author: this.name, content: `Forced final answer generated (${responseText.length} chars).` });
        return {
          content:    responseText,
          model:      finalResult.model || lastModel,
          latencyMs:  totalLatency,
          tokensIn:   totalTokensIn,
          tokensOut:  totalTokensOut,
        };
      }

      console.warn(`[ReAct] Forced call returned insufficient content: "${responseText.slice(0, 100)}"`);
    } catch (err: any) {
      console.error(`[ReAct] Forced final answer call failed:`, err.message);
    }

    // Ultimate fallback: summarize what tools were called
    const toolNames = localMessages
      .filter((m: any) => m.role === 'tool')
      .map((m: any) => m.name)
      .filter(Boolean);

    return {
      content:    toolNames.length
        ? `Research completed using tools: ${toolNames.join(', ')}. Unable to synthesize final answer.`
        : 'Research completed but no final answer was generated.',
      model:      lastModel,
      latencyMs:  totalLatency,
      tokensIn:   totalTokensIn,
      tokensOut:  totalTokensOut,
    };
  }
}