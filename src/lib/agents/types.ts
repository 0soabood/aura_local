import { AgentBid, AgentOutput, AgentName, BlackboardEvent } from '../../shared/types';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import type { CallerMessage } from '../providers/UnifiedCaller';
import { assembleSystemPrompt } from '../supervisors/prompts';
import type { ToolDefinition, ReActResult } from '../tools/types';
import type { ToolRegistry } from '../tools/registry';
import { broadcastEvent } from '../debug';
import { getErrorLogger, ErrorLogger } from '../utils/ErrorLogger';

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

  /**
   * Structured logger with per-agent context.  Subclasses call
   *   this.log.error('message', { key: val }, sessionId);
   * without needing to import anything.
   *
   * Lazy getter because `this.name` (abstract) isn't available during
   * BaseAgent construction; the underlying getErrorLogger() already
   * caches instances by agent name, so this is effectively a singleton
   * per agent class.
   */
  protected get log(): ErrorLogger {
    if (!this._log) this._log = getErrorLogger(this.name);
    return this._log;
  }
  private _log: ErrorLogger | undefined;

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

    let lastStep = 0;
    let didBreak = false;

    for (let step = 0; step < this.maxIterations; step++) {
      lastStep = step;
      broadcastEvent(sessionId, { event_type: 'react_think', author: this.name, content: `Reasoning step ${step + 1}/${this.maxIterations} with ${model}...` });

      let result = await this.registry.call(model, '', {
        temperature: opts.temperature,
        messages:    localMessages,
        tools:       toolDefs.length ? toolDefs : undefined,
      });

      // ── Per-step provider resilience ─────────────────────────────────────
      // If the primary provider rate-limits or returns empty/very weak content,
      // automatically try the fallback chain before giving up on this step.
      const stepFailed = result.rateLimited || !result.text || result.text.trim().length < 3;
      if (stepFailed) {
        const primaryErr = result.errorMessage ?? (result.text ? '(empty response)' : 'no content');
        this.log.warn(
          `Primary provider ${model} failed: ${primaryErr}. Trying fallback chain...`,
          { step: step + 1, error: primaryErr },
          sessionId,
        );
        broadcastEvent(sessionId, {
          event_type: 'react_observe',
          author:     this.name,
          content:    `Provider ${model.split(':')[0]} returned ${primaryErr}. Retrying with different model...`,
        });

        try {
          const fallback = await this.registry.callWithFallback('', {
            temperature: opts.temperature,
            messages:    localMessages,
            tools:       toolDefs.length ? toolDefs : undefined,
          });
          if (fallback.text && fallback.text.trim().length >= 3) {
            this.log.info(
              `Step ${step + 1} fallback succeeded: ${fallback.provider}:${fallback.model ?? 'default'}`,
              { step: step + 1 },
              sessionId,
            );
            result = fallback;
          } else {
            throw new Error(`Fallback returned empty/weak content from ${fallback.provider}`);
          }
        } catch (fbErr: any) {
          // All providers failed for this step.  Instead of hard-throwing and
          // killing the entire ReAct loop, degrade gracefully: if we already
          // have tool results from earlier steps, force-exit the loop early
          // so the max-iterations fallback can produce a useful summary.
          this.log.error(
            `Step ${step + 1} ALL providers failed: ${fbErr.message}`,
            { step: step + 1, error: fbErr.message },
            sessionId,
          );
          broadcastEvent(sessionId, {
            event_type: 'react_observe',
            author:     this.name,
            content:    `All providers failed at step ${step + 1}. Will synthesize from gathered data.`,
          });
          // Break out so the max-iterations path (rich fallback) runs
          didBreak = true;
          break;
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

    // ── Max iterations / early-exit fallback ─────────────────────────────
    // We reach here either because maxIterations was hit, OR because all
    // providers failed during a step and we broke out early.  In both cases
    // we already have tool results accumulated in localMessages.  We now
    // try one or more forced-final-answer prompts; if every prompt fails,
    // we fall through to a rich structured summary of gathered data.
    const exitReason = (!didBreak && lastStep === this.maxIterations - 1) ? 'max_iterations' : 'provider_failure';
    this.log.info(
      `${exitReason} for ${this.name} at step ${lastStep + 1}. localMessages=${localMessages.length}. Forcing final answer...`,
      { exitReason, lastStep: lastStep + 1, messageCount: localMessages.length },
      sessionId,
    );
    broadcastEvent(sessionId, {
      event_type: 'react_observe',
      author:     this.name,
      content:    `Reasoning ended (${exitReason.replace('_', ' ')}). Generating final answer...`,
    });

    // A "useful" response has at least 30 chars AND looks like a complete
    // thought (sentence terminator, markdown header, or list item).
    const isUseful = (text: string): boolean => {
      const t = text.trim();
      if (t.length < 30) return false;
      return /[.!?:;]\s+/.test(t) || /^#{1,3}\s+/.test(t) || t.includes('\n- ') || t.includes('\n1. ');
    };

    // Try up to 3 prompts: standard → more explicit → any available model
    const forcedPrompts = [
      'You have reached the maximum number of reasoning steps. Provide your final answer now based on all the information gathered. Do NOT call any more tools. Give the best answer you can.',
      "Based on all tool results shown above, write a concise but complete answer to the user's original question. Include key facts, numbers, and conclusions. Do NOT mention that you hit a step limit.",
      'Summarize the findings from the tool results in the conversation above. Be specific — include names, numbers, file paths, or any concrete data discovered. Answer directly.',
    ];

    for (let attempt = 0; attempt < forcedPrompts.length; attempt++) {
      const useFallbackChain = attempt === 2; // last attempt: any provider

      try {
        const finalResult = useFallbackChain
          ? await this.registry.callWithFallback('Force final answer after ReAct steps', {
              temperature: opts.temperature ?? 0.3,
              messages: [...localMessages, { role: 'user', content: forcedPrompts[attempt] }],
              // Pass the original model as preferred so the fallback chain
              // tries the intended provider first (not a random one).
              preferred: model,
            })
          : await this.registry.call(lastModel, 'Force final answer after ReAct steps', {
              temperature: opts.temperature ?? 0.3,
              messages: [...localMessages, { role: 'user', content: forcedPrompts[attempt] }],
            });

        const responseText = (finalResult.text || '').trim();
        if (isUseful(responseText)) {
          totalTokensIn  += finalResult.tokensIn ?? 0;
          totalTokensOut += finalResult.tokensOut ?? 0;
          totalLatency   += finalResult.latencyMs ?? 0;

          this.log.info(
            `Forced final answer succeeded on attempt ${attempt + 1} (${responseText.length} chars)`,
            { attempt: attempt + 1, chars: responseText.length },
            sessionId,
          );
          broadcastEvent(sessionId, {
            event_type: 'react_observe',
            author:     this.name,
            content:    `Final answer generated on attempt ${attempt + 1} (${responseText.length} chars).`,
          });
          return {
            content:    responseText,
            model:      finalResult.model || lastModel,
            latencyMs:  totalLatency,
            tokensIn:   totalTokensIn,
            tokensOut:  totalTokensOut,
          };
        }

        this.log.warn(
          `Forced attempt ${attempt + 1} returned insufficient content (${responseText.length} chars)`,
          { attempt: attempt + 1, chars: responseText.length },
          sessionId,
        );
      } catch (err: any) {
        this.log.error(
          `Forced attempt ${attempt + 1} failed: ${err.message}`,
          { attempt: attempt + 1, error: err.message },
          sessionId,
        );
      }
    }

    // ── Rich ultimate fallback ───────────────────────────────────────────
    // Every forced-final-answer attempt failed.  Rather than returning
    // something useless like "Unable to synthesize", we build a structured
    // summary from the actual tool results gathered during the loop.
    const toolMessages = localMessages.filter((m: any) => m.role === 'tool');
    const toolNames = [...new Set(toolMessages.map((m: any) => m.name).filter(Boolean))];

    // Gather up to 6 tool outputs, up to 400 chars each — enough to be useful
    // without flooding the user with raw dumps.
    const gatheredResults = toolMessages
      .slice(0, 6)
      .map((m: any, idx: number) => {
        const name = m.name || `tool-${idx + 1}`;
        const raw = String(m.content || '');
        // Trim to first 400 chars but break at a natural boundary if possible
        let snippet = raw.length > 400
          ? raw.slice(0, 400).replace(/\s+\S*$/, '') + '...'
          : raw;
        // If the tool returned JSON, try to pretty-print the first object
        if (snippet.startsWith('{') || snippet.startsWith('[')) {
          try {
            const parsed = JSON.parse(raw);
            const summary = JSON.stringify(parsed, null, 2).slice(0, 400);
            snippet = summary.length > 400 ? summary.slice(0, 400) + '...' : summary;
          } catch { /* keep raw snippet */ }
        }
        return snippet ? `**${name}**\n${snippet}` : null;
      })
      .filter(Boolean) as string[];

    const lines: string[] = [];

    // Header — honest but helpful, never apologetic in a useless way
    lines.push(`The ${this.name.replace('_', ' ')} explored your request across ${lastStep + 1} reasoning step${lastStep !== 0 ? 's' : ''}.`);
    if (toolNames.length > 0) {
      lines.push(`It used ${toolNames.length} tool${toolNames.length !== 1 ? 's' : ''} (${toolNames.join(', ')}).`);
    }

    // Actual findings
    if (gatheredResults.length > 0) {
      lines.push('');
      lines.push('## What was found');
      lines.push('');
      lines.push(...gatheredResults);
    } else {
      lines.push('');
      lines.push('No tool results were captured during this run.');
    }

    // Suggested next steps — always actionable
    lines.push('');
    lines.push('## Suggested next steps');
    if (gatheredResults.length > 0) {
      lines.push('- The raw data above may contain the answer you need. Ask me to analyze or summarize a specific finding.');
      lines.push('- If the output is too short, try rephrasing your question with more specific terms.');
    } else {
      lines.push('- No data was gathered. This usually means the provider was unavailable or returned empty responses.');
      lines.push('- Try again in a moment, or check that at least one API key is configured in Settings.');
    }
    lines.push(`- If this keeps happening, open Settings → check provider health, or reduce task complexity.`);

    const fallbackText = lines.join('\n');

    this.log.error(
      `ALL forced-final-answer attempts exhausted for ${this.name}. Returning rich fallback (${fallbackText.length} chars).`,
      { fallbackChars: fallbackText.length },
      sessionId,
    );
    broadcastEvent(sessionId, {
      event_type: 'react_observe',
      author:     this.name,
      content:    `All synthesis attempts failed. Returning structured summary of gathered data (${fallbackText.length} chars).`,
    });

    return {
      content:    fallbackText,
      model:      lastModel,
      latencyMs:  totalLatency,
      tokensIn:   totalTokensIn,
      tokensOut:  totalTokensOut,
    };
  }
}