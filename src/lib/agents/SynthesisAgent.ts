import { AgentBid, AgentOutput, BlackboardEvent } from '../../shared/types';
import { BaseAgent } from './types';
import { writeMemoryDef, writeMemoryFn } from '../tools/builtin/write_memory';
import { writeFileDef, writeFileFn } from '../tools/builtin/write_file';
import { editFileDef, editFileFn } from '../tools/builtin/edit_file';
import { runCommandDef, runCommandFn } from '../tools/builtin/run_command';
import { ToolRegistry } from '../tools/registry';
import type { ReActResult } from '../tools/types';
import { peekFallbackChain } from '../ModelConfig';
import { resolveModel } from '../ModelConfig.server';
import { buildSynthesisPrompt } from '../prompts/AgentWiring';
import { broadcastEvent } from '../debug';

/**
 * SynthesisAgent — backed by Gemini Flash.
 *
 * Two operating modes:
 *   1. Synthesis  — combines outputs from other agents into a final answer.
 *                   Confidence 0.90 when at least one agent_output exists and
 *                   the last event is an agent_output (i.e., work to synthesise).
 *   2. Conversational fallback — handles greetings / vague messages when no
 *                   other agent has bid.  Confidence 0.40 when the only event
 *                   so far is the user_message.
 *
 * Always emits event_type='synthesis_complete' to signal loop termination.
 */
export class SynthesisAgent extends BaseAgent {
  readonly name = 'synthesis_agent' as const;

  protected getHealthyModel(): string | undefined {
    return peekFallbackChain('agent_orchestrator').find(m => this.isProviderHealthy(m));
  }

  evaluate(events: BlackboardEvent[]): AgentBid {
    if (!this.getHealthyModel()) {
      return this.bid(0, 'Synthesis provider unavailable.');
    }

    const last = events.at(-1);

    // Don't bid if already at a terminal state.
    if (
      last?.event_type === 'synthesis_complete' ||
      last?.event_type === 'escalation_required'
    ) {
      return this.bid(0, 'nothing to synthesise');
    }

    const pendingTask = events.find(e => (e.event_type as string) === 'task_proposed');

    // Find the most recent user message
    const reversedUserMsgIdx = [...events].reverse().findIndex(e => e.event_type === 'user_message');
    const lastUserIdx = reversedUserMsgIdx >= 0 ? events.length - 1 - reversedUserMsgIdx : -1;
    if (lastUserIdx === -1) {
      return this.bid(0, 'no user message to respond to');
    }

    // Look at everything that happened AFTER the latest user message
    const eventsAfterLastUser = events.slice(lastUserIdx + 1);
    const agentOutputs = eventsAfterLastUser.filter(
      e => e.event_type === 'agent_output' || e.event_type === 'code_written'
    );

    // Mode 1: Rich synthesis — specialist agents produced output for this turn
    if (agentOutputs.length >= 1) {
      return this.bid(0.90, 'Synthesise agent outputs into a final answer');
    }

    // Mode 2: Task execution if user confirmed
    if (pendingTask && last?.event_type === 'user_message') {
      const confirms = /go ahead|do it|proceed|yes|sure|ok|make it|implement/i;
      if (confirms.test(last.content)) {
        return this.bid(0.85, 'User confirmed pending task — execute');
      }
    }

    // Mode 3: Conversational fallback — nothing happened after user message
    if (eventsAfterLastUser.length === 0) {
      return this.bid(0.40, 'Respond conversationally to user message');
    }

    return this.bid(0, 'deferring to specialist agents');
  }

  private buildSynthesisToolRegistry(): ToolRegistry {
    const reg = this.toolRegistry ?? new ToolRegistry();
    if (!reg.has('write_memory')) reg.register(writeMemoryDef, writeMemoryFn);
    if (!reg.has('write_file'))  reg.register(writeFileDef,  writeFileFn);
    if (!reg.has('edit_file'))   reg.register(editFileDef,   editFileFn);
    if (!reg.has('run_command')) reg.register(runCommandDef,  runCommandFn);
    return reg;
  }

  async execute(events: BlackboardEvent[], bid: AgentBid): Promise<AgentOutput> {
    // Find the current turn's boundary
    const reversedUserMsgIdx = [...events].reverse().findIndex(e => e.event_type === 'user_message');
    const lastUserIdx = reversedUserMsgIdx >= 0 ? events.length - 1 - reversedUserMsgIdx : -1;
    const currentTurnEvents = lastUserIdx >= 0 ? events.slice(lastUserIdx) : events;

    // --- BUG-NEW-A: Build conversational turn history for follow-up context ---
    // Extract the last N complete assistant+user turns before the current one
    // so the LLM can resolve pronouns like "that", "it", "the previous code".
    const MAX_HISTORY_TURNS = 3;
    const historyMessages: { role: 'user' | 'assistant'; content: string }[] = [];

    if (lastUserIdx > 0) {
      // Collect user_message + synthesis_complete pairs from before current turn
      const priorEvents = events.slice(0, lastUserIdx);
      const turns: { user?: string; assistant?: string }[] = [];
      let currentTurn: { user?: string; assistant?: string } = {};

      for (const e of priorEvents) {
        if (e.event_type === 'user_message') {
          if (currentTurn.user || currentTurn.assistant) {
            turns.push(currentTurn);
            currentTurn = {};
          }
          currentTurn.user = e.content;
        } else if (e.event_type === 'synthesis_complete' && currentTurn.user) {
          currentTurn.assistant = e.content;
        }
      }
      if (currentTurn.user || currentTurn.assistant) {
        turns.push(currentTurn);
      }

      // Take the last N complete turns (must have both user and assistant)
      const completeTurns = turns
        .filter(t => t.user && t.assistant)
        .slice(-MAX_HISTORY_TURNS);

      for (const turn of completeTurns) {
        historyMessages.push({ role: 'user', content: turn.user! });
        // Truncate very long assistant responses to avoid context bloat
        const assistantContent = turn.assistant!.length > 800
          ? turn.assistant!.slice(0, 800) + '\n\n[... earlier response truncated for brevity ...]'
          : turn.assistant!;
        historyMessages.push({ role: 'assistant', content: assistantContent });
      }
    }

    const agentOutputs = currentTurnEvents.filter(e => e.event_type === 'agent_output' || e.event_type === 'code_written');
    
    // --- BUG-5: Detect which agents produced output for targeted synthesis instructions ---
    const hasCodeOutput = agentOutputs.some(
      e => e.author === 'code_agent' || e.event_type === 'code_written'
    );
    const hasMemoryOutput = agentOutputs.some(
      e => e.author === 'memory_agent' || e.author === 'bureaucracy_agent'
    );
    const hasResearchOutput = agentOutputs.some(
      e => e.author === 'research_agent'
    );

    const instructionParts: string[] = [];
    if (hasCodeOutput) {
      instructionParts.push(
        'The Code Agent has produced implementations. Summarize the changes, show key code snippets, and explain what was built.'
      );
    }
    if (hasMemoryOutput) {
      instructionParts.push(
        'The Memory Agent has stored new facts. Summarize what was remembered and why it matters.'
      );
    }
    if (hasResearchOutput) {
      instructionParts.push(
        'The Research Agent has gathered information. Synthesize the findings into a coherent answer.'
      );
    }

    let synthesisInstruction = '';
    if (instructionParts.length > 0) {
      synthesisInstruction =
        'SYNTHESIS INSTRUCTION: You are synthesizing outputs from specialist agents.\n\n' +
        instructionParts.join('\n\n') +
        '\n\nProvide a clear, well-formatted response that addresses the user\'s original query. Use markdown formatting where appropriate.';
    }

    const hasPendingTask = events.some(e => (e.event_type as string) === 'task_proposed');
    const SYSTEM_PROMPT = buildSynthesisPrompt({
      hasPendingTask,
      sessionPhase: events.length < 3 ? 'initial' : 'ongoing',
    });

    // ONLY pass current turn events to buildMessages — prevents history bleed/echo
    const messages = this.buildMessages(currentTurnEvents, SYSTEM_PROMPT);

    // BUG-NEW-A: Prepend conversational history before current turn messages
    // Insert after system prompt (index 0) so the LLM sees the conversation flow.
    let insertIdx = 1; // After system prompt
    if (historyMessages.length > 0) {
      messages.splice(insertIdx, 0, ...historyMessages);
      insertIdx += historyMessages.length;
    }

    // BUG-5: Inject synthesis instruction as a user message before the current turn
    if (synthesisInstruction) {
      messages.splice(insertIdx, 0, { role: 'user', content: synthesisInstruction });
    }

    // Check if bid contains a preferredModel override
    let model = (bid as any).preferredModel || resolveModel('agent_orchestrator');
    if (!this.isProviderHealthy(model)) model = this.getHealthyModel() as string;

    if (!model) {
      throw new Error('No healthy synthesis provider available.');
    }

    const reg = this.buildSynthesisToolRegistry();

    let reactResult: ReActResult;
    try {
      reactResult = await this.runReactLoop(
        events[0]?.session_id || 'unknown',
        messages,
        model,
        reg.describe(),
        reg,
        { temperature: 0.0 },
      );
    } catch (err: any) {
      // runReactLoop throws when all providers fail or hit rate limits
      const errMsg = err.message ?? String(err);
      const isTimeout = errMsg.includes('[Timeout]') || errMsg.includes('timed out');
      const isRateLimit = errMsg.includes('rate limit') || errMsg.includes('token limit') || errMsg.includes('quota');

      if (isTimeout) {
        // ── Automatic timeout fallback ───────────────────────────────────
        // Try a fast Groq model before telling the user the task failed.
        const FALLBACK_FAST = 'groq:qwen/qwen3-32b';
        this.log.warn(
          `Primary model ${model} timed out. Trying fast fallback ${FALLBACK_FAST}...`,
          { primaryModel: model, fallbackModel: FALLBACK_FAST },
          events[0]?.session_id || 'unknown',
        );
        broadcastEvent(events[0]?.session_id || 'unknown', {
          event_type: 'react_observe',
          author:     this.name,
          content:    `⏱ Primary model timed out. Retrying with faster model (Qwen3-32B on Groq)...`,
        });

        try {
          if (!this.isProviderHealthy(FALLBACK_FAST)) {
            throw new Error(`Fast fallback provider not available (no API key for Groq)`);
          }
          const fallbackReactResult = await this.runReactLoop(
            events[0]?.session_id || 'unknown',
            messages,
            FALLBACK_FAST,
            reg.describe(),
            reg,
            { temperature: 0.0 },
          );
          // Fast fallback succeeded — use its result
          reactResult = fallbackReactResult;
          this.log.info(
            `Fast timeout fallback succeeded with ${FALLBACK_FAST}`,
            { fallbackModel: FALLBACK_FAST },
            events[0]?.session_id || 'unknown',
          );
        } catch (fallbackErr: any) {
          // Both primary and fallback failed — escalate with clear info
          const fbMsg = fallbackErr.message ?? String(fallbackErr);
          this.log.error(
            `Fast timeout fallback also failed: ${fbMsg}`,
            { primaryModel: model, fallbackModel: FALLBACK_FAST, error: fbMsg },
            events[0]?.session_id || 'unknown',
          );
          return {
            event_type: 'escalation_required',
            content: JSON.stringify({
              reason: `Primary model (${model}) timed out. Fast fallback (${FALLBACK_FAST}) also failed: ${fbMsg}`,
              actionable: 'Switch to a faster model like Groq in Settings, or try again later when the API is less congested.',
              timeoutInfo: {
                primaryModel: model,
                fallbackModel: FALLBACK_FAST,
              },
            }),
            metadata: {
              model_id:   FALLBACK_FAST,
              latency_ms: 0,
              confidence: bid.confidence,
              rate_limited: false,
            },
          };
        }
      } else if (isRateLimit) {
        return {
          event_type: 'escalation_required',
          content: JSON.stringify({
            reason: errMsg,
            actionable: 'The API quota is exhausted. Wait for the quota window to reset or configure a paid API key.',
          }),
          metadata: {
            model_id:   model,
            latency_ms: 0,
            confidence: bid.confidence,
            rate_limited: true,
          },
        };
      } else {
        // Re-throw so the orchestrator can append an execution_error event
        throw err;
      }
    }

    const effectiveResult = {
      text: reactResult.content,
      model: reactResult.model,
      latencyMs: reactResult.latencyMs,
      tokensIn: reactResult.tokensIn,
      tokensOut: reactResult.tokensOut,
      rateLimited: false,
    };

    // Guard against hallucinated echo loops (model outputs its own output repetitively)
    const rawText = effectiveResult.text || '';
    const hasEchoLoop = /(a sequence of ){5,}/i.test(rawText)
      || /((\b\w+\b)(\s+\2){7,})/i.test(rawText);  // same word repeated 8+ times
    if (rawText && hasEchoLoop) {
      this.log.warn(
        `Echo loop detected in output. First 100 chars: "${rawText.slice(0, 100)}"`,
        { first100Chars: rawText.slice(0, 100) },
        events[0]?.session_id || 'unknown',
      );
      const agentOutputs = currentTurnEvents.filter(e => e.event_type === 'agent_output' || e.event_type === 'code_written');
      const summary = agentOutputs.length
        ? `I processed the following information but encountered a synthesis error. Here is a raw summary of what was found:\n\n${
            agentOutputs.map(o => `- **[${o.author}]**: ${(o.content || '').slice(0, 200)}`).join('\n')
          }`
        : 'I received your request but was unable to produce a clean response. Please try rephrasing or breaking your request into smaller parts.';
      return {
        event_type: 'synthesis_complete',
        content: summary,
        metadata: {
          model_id:   effectiveResult.model,
          latency_ms: effectiveResult.latencyMs,
          confidence: bid.confidence,
          echo_loop_fallback: true,
        },
      };
    }

    // BUG-5: Trim and strip internal markers like [code_agent]:, [memory_agent]:, [research_agent]:
    let responseText = (effectiveResult.text || '').trim();
    // Strip leading internal agent markers that the LLM may have echoed back
    responseText = responseText.replace(/^\[(code_agent|memory_agent|research_agent|bureaucracy_agent)\]:\s*/gi, '').trim();
    // Strip any remaining internal markers mid-response
    responseText = responseText.replace(/\[(code_agent|memory_agent|research_agent|bureaucracy_agent)\]:\s*/gi, '').trim();

    // BUG-5: Strip pseudo-vector context leaks (file paths + scores, "Relevant Files" headers)
    // NOTE: Do NOT strip generic --- markdown blocks here — that overcorrects and strips
    // legitimate Code agent output that uses horizontal rules as section separators.
    // The input-side fix (types.ts skipping code_context_retrieved) prevents pseudo-vector
    // content from reaching the LLM prompt in the first place.
    responseText = responseText
      .replace(/## Relevant Files \(Pseudo-Vector Search Results\)[\s\S]*?(?=\n#{1,2}\s|\n\n[A-Z]|$)/gi, '')
      .replace(/### [^\n]+\nScore:\s*[\d.]+\n````[\s\S]*?````/gi, '')
      .replace(/Score:\s*[\d.]+/gi, '')
      .replace(/Found \d+ relevant files:/gi, '')
      .trim();

    // P3: Surface memory-update transparency — if BureaucracyAgent recorded a preference
    // change, prepend the diff notation so the user sees it even if the LLM doesn't echo it.
    const memoryUpdateEvent = currentTurnEvents.find(
      e => e.author === 'bureaucracy_agent' && e.content?.includes('🔄 **Updated memory:**')
    );
    if (memoryUpdateEvent) {
      const updateLine = memoryUpdateEvent.content.match(/🔄 \*\*Updated memory:\*\* .+/)?.[0] ?? '';
      if (updateLine) {
        responseText = `${updateLine}\n\n${responseText}`;
      }
    }

    if (!responseText) {
      // BUG-5: Defensive fallback — graceful fallback with raw agent outputs
      if (agentOutputs.length > 0) {
        const fallbackParts = agentOutputs.map(o => {
          const agentLabel = o.author === 'code_agent' || o.event_type === 'code_written'
            ? 'Code Agent'
            : o.author === 'memory_agent' || o.author === 'bureaucracy_agent'
              ? 'Memory Agent'
              : o.author === 'research_agent'
                ? 'Research Agent'
                : o.author || 'Agent';
          return `**${agentLabel}** produced the following:\n\n${o.content || '(no output)'}`;
        });
        responseText = fallbackParts.join('\n\n---\n\n');
      } else {
        responseText = 'I received your request but no agent output was available to synthesize. Please try rephrasing your request.';
      }
    }

    // Persist a one-sentence summary to USER.md — best-effort, never crashes synthesis.
    const memReg = this.buildSynthesisToolRegistry();
    const summary = responseText.slice(0, 200).replace(/\n/g, ' ').trim();
    if (summary) {
      memReg.execute({
        id:        'synthesis_memory',
        name:      'write_memory',
        arguments: {
          file:    'USER',
          content: `Session summary (${new Date().toISOString().slice(0, 10)}): ${summary}`,
        },
      }).catch(() => { /* silent */ });
    }

    return {
      event_type: 'synthesis_complete',
      content:    responseText,
      metadata: {
        model_id:   effectiveResult.model,
        latency_ms: effectiveResult.latencyMs,
        confidence: bid.confidence,
        mode:       agentOutputs.length > 0 ? 'synthesis' : 'conversational',
        tokens_in:  effectiveResult.tokensIn,
        tokens_out: effectiveResult.tokensOut,
      },
    };
  }

  private bid(confidence: number, proposedAction: string): AgentBid {
    return { agentName: 'synthesis_agent', confidence, proposedAction, expectedOutputShape: 'markdown_report' };
  }
}
