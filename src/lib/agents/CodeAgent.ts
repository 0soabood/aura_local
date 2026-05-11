import { AgentBid, AgentOutput, BlackboardEvent } from '../../shared/types';
import { getFileSkeletonDef, getFileSkeletonFn, searchCodebaseDef, searchCodebaseFn } from '../context/ContextTools';
import { BaseAgent } from './types';
import { readFileDef, readFileFn } from '../tools/builtin/read_file';
import { listDirectoryDef, listDirectoryFn } from '../tools/builtin/list_directory';
import { writeFileDef, writeFileFn } from '../tools/builtin/write_file';
import { editFileDef, editFileFn } from '../tools/builtin/edit_file';
import { runCommandDef, runCommandFn } from '../tools/builtin/run_command';
import { ToolRegistry } from '../tools/registry';
import { peekFallbackChain } from '../ModelConfig';
import { resolveModel } from '../ModelConfig.server';
import { buildCodePrompt } from '../prompts/AgentWiring';

const CODE_RE =
  /\b(code|function|class|implement|debug|refactor|build|api|endpoint|script|bug|fix|parse|regex|sql|query|algorithm|test|deploy|lint|type|interface|module|file|files|folder|folders|directory|directories|path|paths|read)\b/i;

// Matches error messages that indicate a hallucinated/non-existent file path.
// Covers: ENOENT from fs, and the structured errors returned by executeContextTool.
const DEAD_PATH_ERROR_RE = /ENOENT|Placeholder file path|Template file path|escapes project root/i;

/**
 * CodeAgent — backed by Groq llama-3.3-70b-versatile.
 *
 * Bid heuristic:
 *   • High (0.85) — user message is code-flavoured AND no code output exists yet
 *   • Medium (0.60) — execution_error is present (any agent) — code agent can repair
 *   • Abstain (0) — provider unavailable, already produced output, or no code signal
 *   • Abstain (0) — last event is a code_agent error caused by a bad/placeholder file path
 *                   (standing down to break the ENOENT recovery loop)
 */
export class CodeAgent extends BaseAgent {
  readonly name = 'code_agent' as const;

  private getHealthyModel(): string | undefined {
    return peekFallbackChain('daily_driver').find(m => this.isProviderHealthy(m));
  }

  evaluate(events: BlackboardEvent[]): AgentBid {
    const userMsg = this.userMessage(events).toLowerCase();
    let isCodeMatch = CODE_RE.test(userMsg);

    // Context-aware bidding: If the user says "go ahead", inherit intent from previous message
    const isContinuation = userMsg.length < 50 && /go ahead|do it|yes|yep|sure|ok|okay|proceed|make it|build it|implement|continue|next/i.test(userMsg);
    if (!isCodeMatch && isContinuation) {
      const userMsgs = events.filter(e => e.event_type === 'user_message');
      const prevMsg = userMsgs.at(-2)?.content.toLowerCase() ?? '';
      isCodeMatch = CODE_RE.test(prevMsg);
    }
    const model = this.getHealthyModel();

    if (!model) {
      return { agentName: 'code_agent', confidence: 0.0, proposedAction: 'Code provider unavailable.', expectedOutputShape: 'code' };
    }

    // Break dead-path recovery loops (ENOENT / placeholder file path failures).
    const lastCodeAgentError = this.lastCodeAgentErrorMessage(events);
    if (lastCodeAgentError && DEAD_PATH_ERROR_RE.test(lastCodeAgentError)) {
      return {
        agentName: 'code_agent',
        confidence: 0.0,
        proposedAction: 'Standing down — same placeholder-path failure would repeat on retry.',
        expectedOutputShape: 'code',
      };
    }

    // Strict keyword gate — CodeAgent never bids on empty or non-code messages.
    // This prevents inputs like "make me money" or "heart surgery" from triggering
    // the code-error-recovery path when another agent has already failed.
    if (!userMsg.trim() || !isCodeMatch) {
      return {
        agentName: 'code_agent',
        confidence: 0.0,
        proposedAction: 'No code keywords detected — abstaining.',
        expectedOutputShape: 'code',
      };
    }

    // Message is confirmed code-related and provider is healthy.
    const alreadyRan = this.outputsBy(events, 'code_agent').length > 0;
    const hasError   = this.hasErrors(events);

    let confidence = 0;
    let proposedAction = `Generate or debug code via ${model}`;

    if (!alreadyRan) {
      confidence = 0.85;
    } else if (hasError) {
      confidence = 0.60;
      proposedAction = 'Attempt code-based recovery from execution error';
    }

    // Two consecutive failures → abstain so SynthesisAgent can report the error.
    if (this.consecutiveErrorsBy(events, 'code_agent')) {
      confidence = 0;
      proposedAction = 'Repeated execution failures — abstaining to allow fallback';
    }

    return { agentName: 'code_agent', confidence, proposedAction, expectedOutputShape: 'code' };
  }

  private buildCodeToolRegistry(): ToolRegistry {
    const reg = this.toolRegistry ?? new ToolRegistry();
    if (!reg.has('get_file_skeleton')) reg.register(getFileSkeletonDef, getFileSkeletonFn);
    if (!reg.has('search_codebase'))   reg.register(searchCodebaseDef,  searchCodebaseFn);
    if (!reg.has('read_file'))         reg.register(readFileDef,         readFileFn);
    if (!reg.has('list_directory'))    reg.register(listDirectoryDef,    listDirectoryFn);
    if (!reg.has('write_file'))        reg.register(writeFileDef,        writeFileFn);
    if (!reg.has('edit_file'))         reg.register(editFileDef,         editFileFn);
    if (!reg.has('run_command'))       reg.register(runCommandDef,       runCommandFn);
    return reg;
  }

  async execute(events: BlackboardEvent[], bid: AgentBid): Promise<AgentOutput> {
    const SYSTEM_PROMPT = buildCodePrompt({
      sessionPhase: events.length < 3 ? 'initial' : 'ongoing',
      availableTools: ['get_file_skeleton', 'search_codebase', 'read_file', 'list_directory', 'write_file', 'edit_file', 'run_command'],
    });

    const messages = this.buildMessages(events, SYSTEM_PROMPT);

    let model = bid.preferredModel || resolveModel('daily_driver');
    if (!this.isProviderHealthy(model)) model = this.getHealthyModel() as string;

    if (!model) {
      throw new Error('No healthy code provider available during execution.');
    }

    const reg = this.buildCodeToolRegistry();
    const reactResult = await this.runReactLoop(
      events[0]?.session_id || 'unknown',
      messages,
      model,
      reg.describe(),
      reg,
      { temperature: 0.0 }, // Phase 2: Anchor at absolute zero to stabilize Gemini tokenizers
    );

    return {
      event_type: 'code_written',
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

  /**
   * If the most recent event is an execution_error attributed to code_agent,
   * return the error message string; otherwise null.
   */
  private lastCodeAgentErrorMessage(events: BlackboardEvent[]): string | null {
    const last = events.at(-1);
    if (!last || last.event_type !== 'execution_error') return null;
    try {
      const parsed = JSON.parse(last.content) as { agent?: string; error?: string };
      if (parsed.agent !== 'code_agent') return null;
      return parsed.error ?? null;
    } catch {
      return null;
    }
  }
}
