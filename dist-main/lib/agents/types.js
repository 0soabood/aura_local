"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAgent = void 0;
const prompts_1 = require("../supervisors/prompts");
/** All concrete agents receive the shared registry at construction time. */
class BaseAgent {
    constructor(registry) {
        this.registry = registry;
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
}
exports.BaseAgent = BaseAgent;
