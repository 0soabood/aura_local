import { AgentBid, AgentOutput, BlackboardEvent } from '../../shared/types';
import { BaseAgent } from './types';
import { readFileDef, readFileFn } from '../tools/builtin/read_file';
import { listDirectoryDef, listDirectoryFn } from '../tools/builtin/list_directory';
import { ToolRegistry } from '../tools/registry';
import { peekFallbackChain } from '../ModelConfig';
import { resolveModel } from '../ModelConfig.server';
import { buildResearchPrompt } from '../prompts/AgentWiring';

const RESEARCH_RE =
  /\b(research|find|search|market|analyze|analyse|trend|intel|report|price|news|data|what is|who is|how does|when did|where is|why does|benchmark|compare|survey)\b/i;

/**
 * ResearchAgent — backed by Groq compound-beta-mini (search-augmented).
 *
 * Bid heuristic:
 *   • High (0.85) — user message is research-flavoured AND no research output exists yet
 *   • Medium (0.65) — there is an execution_error and the erroring agent was research
 *   • Abstain (0) — provider unavailable, research already ran, or query isn't research-flavoured
 */
export class ResearchAgent extends BaseAgent {
  readonly name = 'research_agent' as const;

  private getHealthyModel(): string | undefined {
    return peekFallbackChain('long_context').find(m => this.isProviderHealthy(m));
  }

  evaluate(events: BlackboardEvent[]): AgentBid {
    if (!this.getHealthyModel()) {
      return { agentName: 'research_agent', confidence: 0.0, proposedAction: 'Research provider unavailable.', expectedOutputShape: 'text' };
    }

    const userMsg = this.userMessage(events).toLowerCase();
    let isResearchMatch = RESEARCH_RE.test(userMsg);

    const isContinuation = userMsg.length < 50 && /go ahead|do it|yes|yep|sure|ok|okay|proceed|continue|next/i.test(userMsg);
    if (!isResearchMatch && isContinuation) {
      const userMsgs = events.filter(e => e.event_type === 'user_message');
      const prevMsg = userMsgs.at(-2)?.content.toLowerCase() ?? '';
      isResearchMatch = RESEARCH_RE.test(prevMsg);
    }
    const alreadyRan = this.outputsBy(events, 'research_agent').length > 0;

    const lastError = [...events].reverse().find(e => e.event_type === 'execution_error') ?? null;
    const errorWasResearch = lastError
      ? (() => { try { return JSON.parse(lastError.content)?.agent === 'research_agent'; } catch { return false; } })()
      : false;

    let confidence = 0;
    let proposedAction = 'Retrieve web-sourced intelligence via Groq compound-beta-mini';

    if (!alreadyRan && isResearchMatch) {
      confidence = 0.85;
    } else if (errorWasResearch) {
      confidence = 0.65;
      proposedAction = 'Retry failed research step';
    }

    return { agentName: 'research_agent', confidence, proposedAction, expectedOutputShape: 'text' };
  }

  private buildResearchToolRegistry(): ToolRegistry {
    const reg = this.toolRegistry ?? new ToolRegistry();
    if (!reg.has('read_file'))      reg.register(readFileDef,      readFileFn);
    if (!reg.has('list_directory')) reg.register(listDirectoryDef, listDirectoryFn);
    return reg;
  }

  async execute(events: BlackboardEvent[], bid: AgentBid): Promise<AgentOutput> {
    const SYSTEM_PROMPT = buildResearchPrompt({
      sessionPhase: events.length < 3 ? 'initial' : 'ongoing',
    });

    const messages = this.buildMessages(events, SYSTEM_PROMPT);
    const reg = this.buildResearchToolRegistry();

    let model = bid.preferredModel || resolveModel('long_context');
    if (!this.isProviderHealthy(model)) model = this.getHealthyModel() as string;

    const reactResult = await this.runReactLoop(
      events[0]?.session_id || 'unknown',
      messages,
      model,
      reg.describe(),
      reg,
      { temperature: 0.0 },
    );

    return {
      event_type: 'agent_output',
      content:    reactResult.content,
      metadata: {
        model_id:   reactResult.model,
        latency_ms: reactResult.latencyMs,
        confidence: bid.confidence,
        tokens_in:  reactResult.tokensIn,
        tokens_out: reactResult.tokensOut,
      },
    };
  }
}
