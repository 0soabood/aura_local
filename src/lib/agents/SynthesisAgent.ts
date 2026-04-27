import { AgentBid, AgentOutput, BlackboardEvent } from '../../shared/types';
import { BaseAgent } from './types';
import { writeMemoryDef, writeMemoryFn } from '../tools/builtin/write_memory';
import { ToolRegistry } from '../tools/registry';

const SYNTHESIS_MODELS = [
  'anthropic:claude-3-5-sonnet-latest',
  'openai:gpt-4o',
  'groq:llama-3.1-8b-instant',
  'gemini:gemini-2.5-flash',
  'openrouter:auto'
];

const SYSTEM_PROMPT =
  'You are the Synthesis Agent — a world-class editor and communicator. ' +
  'Your sole job is to produce the final, polished response the user actually reads.\n\n' +

  'SYNTHESIS MODE (when other agents have produced output):\n' +
  '- Combine the outputs from sibling agents (research_agent, code_agent) into a single, ' +
  '  coherent response that directly answers the user\'s original request.\n' +
  '- Preserve all factual content and code. Do not summarise away important detail.\n' +
  '- Resolve any contradictions between agent outputs. If they disagree, acknowledge it.\n' +
  '- Remove redundancy. If two agents said the same thing, say it once — better.\n' +
  '- Maintain a consistent voice and reading level throughout.\n\n' +

  'CONVERSATIONAL MODE (when no specialist has run):\n' +
  '- Respond directly and naturally to greetings, meta-questions, or vague inputs.\n' +
  '- Be concise. If the question is simple, the answer should be simple.\n' +
  '- You may briefly describe your capabilities if asked, but do not over-explain.\n\n' +

  'STRICT OUTPUT RULES:\n' +
  '- Never begin with "Certainly!", "Great!", "Of course!" or similar filler.\n' +
  '- Never add meta-commentary such as "Based on the agent outputs above..." or ' +
  '  "As the Synthesis Agent, I will now...".\n' +
  '- Never reveal internal agent names, confidence scores, or orchestration details ' +
  '  unless the user explicitly asked how the system works.\n' +
  '- The response you produce IS the final answer. Make it worthy of that.';

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

  private getHealthyModel(): string | undefined {
    return SYNTHESIS_MODELS.find(m => this.isProviderHealthy(m));
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

    const agentOutputs = events.filter(e => e.event_type === 'agent_output' || e.event_type === 'code_written');

    // Mode 1: rich synthesis — at least one other agent has produced output.
    if (agentOutputs.length >= 1 && (last?.event_type === 'agent_output' || last?.event_type === 'code_written')) {
      return this.bid(0.90, 'Synthesise agent outputs into a final answer');
    }

    // Mode 2: conversational fallback — only the user_message exists.
    if (events.length === 1 && last?.event_type === 'user_message') {
      return this.bid(0.40, 'Respond conversationally to vague or greeting input');
    }

    return this.bid(0, 'deferring to specialist agents');
  }

  async execute(events: BlackboardEvent[], bid: AgentBid): Promise<AgentOutput> {
    const agentOutputs = events.filter(e => e.event_type === 'agent_output' || e.event_type === 'code_written');
    const messages = this.buildMessages(events, SYSTEM_PROMPT);

    const model = this.getHealthyModel();
    if (!model) {
      throw new Error('No healthy synthesis provider available.');
    }

    const result = await this.registry.call(
      model,
      '',
      { temperature: 0.3, messages },
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

    // Persist a one-sentence summary to USER.md — best-effort, never crashes synthesis.
    const memReg = this.toolRegistry ?? new ToolRegistry();
    if (!memReg.has('write_memory')) memReg.register(writeMemoryDef, writeMemoryFn);
    const summary = result.text.slice(0, 200).replace(/\n/g, ' ').trim();
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
      content:    result.text,
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
    return { agentName: 'synthesis_agent', confidence, proposedAction, expectedOutputShape: 'text' };
  }
}
