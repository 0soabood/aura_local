import { AgentBid, AgentOutput, BlackboardEvent } from '../../shared/types';
import { BaseAgent } from './types';
import { writeMemoryDef, writeMemoryFn } from '../tools/builtin/write_memory';
import { writeFileDef, writeFileFn } from '../tools/builtin/write_file';
import { editFileDef, editFileFn } from '../tools/builtin/edit_file';
import { runCommandDef, runCommandFn } from '../tools/builtin/run_command';
import { ToolRegistry } from '../tools/registry';
import { peekFallbackChain } from '../ModelConfig';
import { resolveModel } from '../ModelConfig.server';
import { buildSynthesisPrompt } from '../prompts/AgentWiring';

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

  async execute(events: BlackboardEvent[], bid: AgentBid): Promise<AgentOutput> {
    // Find the current turn's boundary
    const reversedUserMsgIdx = [...events].reverse().findIndex(e => e.event_type === 'user_message');
    const lastUserIdx = reversedUserMsgIdx >= 0 ? events.length - 1 - reversedUserMsgIdx : -1;
    const currentTurnEvents = lastUserIdx >= 0 ? events.slice(lastUserIdx) : events;

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

    // BUG-5: Inject synthesis instruction as a user message after the system prompt
    if (synthesisInstruction) {
      // Insert right after the system message (index 1), before any conversation
      messages.splice(1, 0, { role: 'user', content: synthesisInstruction });
    }

    // Check if bid contains a preferredModel override
    let model = (bid as any).preferredModel || resolveModel('agent_orchestrator');
    if (!this.isProviderHealthy(model)) model = this.getHealthyModel() as string;

    if (!model) {
      throw new Error('No healthy synthesis provider available.');
    }

    const result = await this.registry.call(
      model,
      '',
      { temperature: 0.0, messages },
    );

    if (result.rateLimited) {
      const retryHint = result.retryAfterSeconds
        ? ` Please wait ${result.retryAfterSeconds}s before retrying.`
        : '';
      return {
        event_type: 'escalation_required',
        content: JSON.stringify({
          reason: result.errorMessage ?? 'Synthesis API rate limit exceeded.',
          actionable:
            `The API quota is exhausted.${retryHint} ` +
            'Wait for the quota window to reset or configure a paid API key.',
        }),
        metadata: {
          model_id:     result.model,
          latency_ms:   result.latencyMs,
          confidence:   bid.confidence,
          rate_limited: true,
        },
      };
    }

    // Guard against hallucinated echo loops (model outputs its own output repetitively)
    const rawText = result.text || '';
    const hasEchoLoop = /(a sequence of ){5,}/i.test(rawText)
      || /((\b\w+\b)(\s+\2){7,})/i.test(rawText);  // same word repeated 8+ times
    if (rawText && hasEchoLoop) {
      console.warn(`[Synthesis] Echo loop detected in output, falling back to summary. First 100 chars: "${rawText.slice(0, 100)}"`);
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
          model_id:   result.model,
          latency_ms: result.latencyMs,
          confidence: bid.confidence,
          echo_loop_fallback: true,
        },
      };
    }

    // BUG-5: Trim and strip internal markers like [code_agent]:, [memory_agent]:, [research_agent]:
    let responseText = (result.text || '').trim();
    // Strip leading internal agent markers that the LLM may have echoed back
    responseText = responseText.replace(/^\[(code_agent|memory_agent|research_agent|bureaucracy_agent)\]:\s*/gi, '').trim();
    // Strip any remaining internal markers mid-response
    responseText = responseText.replace(/\[(code_agent|memory_agent|research_agent|bureaucracy_agent)\]:\s*/gi, '').trim();

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
    const memReg = this.toolRegistry ?? new ToolRegistry();
    if (!memReg.has('write_memory')) memReg.register(writeMemoryDef, writeMemoryFn);
    if (!memReg.has('write_file')) memReg.register(writeFileDef, writeFileFn);
    if (!memReg.has('edit_file')) memReg.register(editFileDef, editFileFn);
    if (!memReg.has('run_command')) memReg.register(runCommandDef, runCommandFn);
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
        model_id:   result.model,
        latency_ms: result.latencyMs,
        confidence: bid.confidence,
        mode:       agentOutputs.length > 0 ? 'synthesis' : 'conversational',
        tokens_in:  result.tokensIn,
        tokens_out: result.tokensOut,
      },
    };
  }

  private bid(confidence: number, proposedAction: string): AgentBid {
    return { agentName: 'synthesis_agent', confidence, proposedAction, expectedOutputShape: 'markdown_report' };
  }
}
