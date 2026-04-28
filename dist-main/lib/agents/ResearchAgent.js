"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResearchAgent = void 0;
const types_1 = require("./types");
const read_file_1 = require("../tools/builtin/read_file");
const list_directory_1 = require("../tools/builtin/list_directory");
const registry_1 = require("../tools/registry");
const RESEARCH_RE = /\b(research|find|search|market|analyze|analyse|trend|intel|report|price|news|data|what is|who is|how does|when did|where is|why does|benchmark|compare|survey)\b/i;
const PRIMARY_ROUTING = 'groq:compound-beta-mini';
const SYSTEM_PROMPT = 'You are the Research Agent — an expert analyst and information synthesizer. ' +
    'You retrieve, verify, and distill knowledge with rigorous attention to factual accuracy.\n\n' +
    'RESEARCH STANDARDS:\n' +
    '- Prioritise accuracy over speed. If you are uncertain about a fact, say so explicitly.\n' +
    '- Distinguish between established facts, expert consensus, and contested claims.\n' +
    '- When citing data (numbers, dates, statistics), state the source or acknowledge uncertainty.\n' +
    '- Do not hallucinate citations. If you cannot verify a source, omit the reference.\n' +
    '- Synthesise information into clear, structured answers — not raw dumps of facts.\n\n' +
    'APPROACH:\n' +
    '1. Identify the core question behind the user\'s request before answering.\n' +
    '2. If the question has multiple dimensions, address each one explicitly.\n' +
    '3. Use headers and bullet points for complex answers. Use prose for simple ones.\n' +
    '4. If prior agents have already contributed context, build on it — do not repeat it.\n' +
    '5. Close with a concise summary if the answer is longer than 3 paragraphs.\n\n' +
    'TOOL EXECUTION RULES:\n' +
    '- Ensure all string values in function call arguments are properly JSON-escaped.\n\n' +
    'OUTPUT FORMAT:\n' +
    '- Lead with the direct answer to the question.\n' +
    '- Follow with supporting evidence or explanation.\n' +
    '- Flag any significant uncertainty or knowledge cutoff at the end.\n' +
    '- Do not add meta-commentary such as "As an AI..." or "Based on my training...".';
/**
 * ResearchAgent — backed by Groq compound-beta-mini (search-augmented).
 *
 * Bid heuristic:
 *   • High (0.85) — user message is research-flavoured AND no research output exists yet
 *   • Medium (0.65) — there is an execution_error and the erroring agent was research
 *   • Abstain (0) — provider unavailable, research already ran, or query isn't research-flavoured
 */
class ResearchAgent extends types_1.BaseAgent {
    constructor() {
        super(...arguments);
        this.name = 'research_agent';
    }
    evaluate(events) {
        if (!this.isProviderHealthy(PRIMARY_ROUTING)) {
            return { agentName: 'research_agent', confidence: 0.0, proposedAction: 'Research provider unavailable.', expectedOutputShape: 'text' };
        }
        const userMsg = this.userMessage(events).toLowerCase();
        const alreadyRan = this.outputsBy(events, 'research_agent').length > 0;
        const lastError = [...events].reverse().find(e => e.event_type === 'execution_error') ?? null;
        const errorWasResearch = lastError
            ? (() => { try {
                return JSON.parse(lastError.content)?.agent === 'research_agent';
            }
            catch {
                return false;
            } })()
            : false;
        let confidence = 0;
        let proposedAction = 'Retrieve web-sourced intelligence via Groq compound-beta-mini';
        if (!alreadyRan && RESEARCH_RE.test(userMsg)) {
            confidence = 0.85;
        }
        else if (errorWasResearch) {
            confidence = 0.65;
            proposedAction = 'Retry failed research step';
        }
        return { agentName: 'research_agent', confidence, proposedAction, expectedOutputShape: 'text' };
    }
    buildResearchToolRegistry() {
        const reg = this.toolRegistry ?? new registry_1.ToolRegistry();
        if (!reg.has('read_file'))
            reg.register(read_file_1.readFileDef, read_file_1.readFileFn);
        if (!reg.has('list_directory'))
            reg.register(list_directory_1.listDirectoryDef, list_directory_1.listDirectoryFn);
        return reg;
    }
    async execute(events, bid) {
        const messages = this.buildMessages(events, SYSTEM_PROMPT);
        const reg = this.buildResearchToolRegistry();
        const reactResult = await this.runReactLoop(messages, PRIMARY_ROUTING, [], // compound-beta-mini does not support tool calling.
        reg, { temperature: 0.0 });
        return {
            event_type: 'agent_output',
            content: reactResult.content,
            metadata: {
                model_id: reactResult.model,
                latency_ms: reactResult.latencyMs,
                confidence: bid.confidence,
                tokens_in: reactResult.tokensIn,
                tokens_out: reactResult.tokensOut,
            },
        };
    }
}
exports.ResearchAgent = ResearchAgent;
