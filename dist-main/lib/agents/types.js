"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAgent = void 0;
const prompts_1 = require("../supervisors/prompts");
const MAX_REACT_STEPS = 5;
/** All concrete agents receive the shared registry at construction time. */
class BaseAgent {
    constructor(registry, toolRegistry) {
        this.registry = registry;
        this.toolRegistry = toolRegistry;
    }
    /** Find the first user_message in the log. */
    userMessage(events) {
        return events.find(e => e.event_type === 'user_message')?.content ?? '';
    }
    /** Collect content strings from agent_output events by a specific author. */
    outputsBy(events, author) {
        return events
            .filter(e => e.event_type === 'agent_output' && e.author === author)
            .map(e => e.content);
    }
    /** True if any execution_error event is present in the log. */
    hasErrors(events) {
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
    buildMessages(events, systemPrompt) {
        const ASSISTANT_EVENTS = new Set([
            'agent_output', 'code_written', 'code_context_retrieved', 'synthesis_complete',
        ]);
        // assembleSystemPrompt() is the single authority channel: memory first, then
        // the agent-specific base prompt.  One system message, deterministic order.
        const messages = [
            { role: 'system', content: (0, prompts_1.assembleSystemPrompt)(systemPrompt) },
        ];
        for (const e of events) {
            if (e.event_type === 'user_message') {
                messages.push({ role: 'user', content: e.content });
            }
            else if (ASSISTANT_EVENTS.has(e.event_type)) {
                messages.push({ role: 'assistant', content: `[${e.author}]: ${e.content}` });
            }
            else if (e.event_type === 'execution_error') {
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
    isProviderHealthy(routing) {
        const providerId = routing.includes(':') ? routing.slice(0, routing.indexOf(':')) : routing;
        return this.registry.listProviders().includes(providerId);
    }
    /**
     * True if the last `n` recorded attempts (successes + errors) by `agentName`
     * were all execution_errors — signals a stuck agent that should abstain.
     */
    consecutiveErrorsBy(events, agentName, n = 2) {
        const attempts = events.filter(e => {
            if (e.event_type === 'agent_output' && e.author === agentName)
                return true;
            if (e.event_type === 'execution_error') {
                try {
                    return JSON.parse(e.content)?.agent === agentName;
                }
                catch {
                    return false;
                }
            }
            return false;
        });
        const tail = attempts.slice(-n);
        return tail.length === n && tail.every(e => e.event_type === 'execution_error');
    }
    /**
     * Bounded ReAct loop: Reason → Act → Observe, up to MAX_REACT_STEPS times.
     *
     * On each step the LLM is called with the current message history and the
     * provided tool definitions. If the LLM produces tool calls, each is
     * executed via the registry and the results are appended to the conversation
     * before the next step. The loop exits when the LLM produces a response with
     * no tool calls, or when MAX_REACT_STEPS is reached (forcing a final answer).
     *
     * Tool results are injected in the OpenAI tool-message format so that
     * OpenAI-compatible providers (Groq, OpenRouter, etc.) maintain a valid
     * conversation structure; other providers handle them as text.
     */
    async runReactLoop(messages, model, toolDefs, toolRegistry, opts = {}) {
        const localMessages = [...messages];
        let totalTokensIn = 0;
        let totalTokensOut = 0;
        let totalLatency = 0;
        let lastModel = model;
        for (let step = 0; step < MAX_REACT_STEPS; step++) {
            const result = await this.registry.call(model, '', {
                temperature: opts.temperature,
                messages: localMessages,
                tools: toolDefs.length ? toolDefs : undefined,
            });
            totalTokensIn += result.tokensIn;
            totalTokensOut += result.tokensOut;
            totalLatency += result.latencyMs;
            lastModel = result.model;
            if (!result.toolCalls?.length) {
                return {
                    content: result.text,
                    model: lastModel,
                    latencyMs: totalLatency,
                    tokensIn: totalTokensIn,
                    tokensOut: totalTokensOut,
                };
            }
            // Append the assistant's tool-call intent (preserves OpenAI protocol).
            localMessages.push({
                role: 'assistant',
                content: null,
                tool_calls: result.toolCalls,
            });
            // Execute each tool call and append the result as a tool message.
            for (const tc of result.toolCalls) {
                let toolArgs;
                try {
                    toolArgs = typeof tc.function.arguments === 'string'
                        ? JSON.parse(tc.function.arguments)
                        : (tc.function.arguments ?? {});
                }
                catch {
                    toolArgs = {};
                }
                const toolResult = await toolRegistry.execute({
                    id: tc.id ?? `tool_${step}_${tc.function.name}`,
                    name: tc.function.name,
                    arguments: toolArgs,
                });
                localMessages.push({
                    role: 'tool',
                    content: toolResult.content,
                    tool_call_id: toolResult.tool_call_id,
                });
            }
        }
        // Max steps reached — make a final call without tools to force a summary.
        const finalResult = await this.registry.call(model, '', {
            temperature: opts.temperature,
            messages: [
                ...localMessages,
                { role: 'user', content: 'Please provide your final answer based on the information gathered.' },
            ],
        });
        return {
            content: finalResult.text,
            model: finalResult.model,
            latencyMs: totalLatency + finalResult.latencyMs,
            tokensIn: totalTokensIn + finalResult.tokensIn,
            tokensOut: totalTokensOut + finalResult.tokensOut,
        };
    }
}
exports.BaseAgent = BaseAgent;
