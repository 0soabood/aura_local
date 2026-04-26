"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupervisorRouter = void 0;
const ProviderRegistry_1 = require("./providers/ProviderRegistry");
const GeminiProvider_1 = require("./providers/GeminiProvider");
const GroqProvider_1 = require("./providers/GroqProvider");
const CodexCliProvider_1 = require("./providers/CodexCliProvider");
const Blackboard_1 = require("./Blackboard");
const SupervisorStatsRepository_1 = require("../db/repositories/SupervisorStatsRepository");
const prompts_1 = require("./supervisors/prompts");
const MAX_ESCALATION_DEPTH = 2;
/**
 * SupervisorRouter — the core v2 orchestrator.
 *
 * Flow per request:
 *   1. Auto-classify domain (or use caller-supplied domain)
 *   2. Fetch session context from Blackboard
 *   3. Call the supervisor model → get a JSON execution plan
 *   4. Execute each step sequentially via ProviderRegistry
 *   5. Publish blackboard_updates back to Blackboard
 *   6. Record stats via SupervisorStatsRepository
 *   7. Handle escalation (depth-limited) recursively
 */
class SupervisorRouter {
    constructor() {
        this.registry = new ProviderRegistry_1.ProviderRegistry();
        this.registry
            .register(new GeminiProvider_1.GeminiProvider())
            .register(new GroqProvider_1.GroqProvider())
            .register(new CodexCliProvider_1.CodexCliProvider());
        this.blackboard = new Blackboard_1.Blackboard();
    }
    async route(task) {
        const depth = task.depth ?? 0;
        const domain = task.domain ?? (0, prompts_1.classifyDomain)(task.objective);
        const config = prompts_1.DOMAIN_CONFIG[domain];
        const routerStart = Date.now();
        // 1. Get shared context
        const context = this.blackboard.getContext(task.sessionId);
        // 2. Build and execute the supervisor planning call.
        //    assembleSystemPrompt() is the single authority channel: memory first,
        //    then the base planner prompt.  No separate systemPrompt option is used
        //    so there is exactly one system role message per request.
        const supervisorSystemPrompt = (0, prompts_1.assembleSystemPrompt)(`You are the ${config.name} for AURA_LOCAL_SYNC v2. ` +
            `${config.systemHint} ` +
            `Produce ONLY valid JSON — no prose, no markdown fences.`);
        const supervisorPrompt = (0, prompts_1.buildSupervisorPrompt)(config, task.objective, context);
        let plan;
        try {
            const planResult = await this.registry.call(config.supervisorRouting, supervisorPrompt, { temperature: 0.1, responseFormat: 'json', systemPrompt: supervisorSystemPrompt });
            plan = this.parsePlan(planResult.text);
        }
        catch (err) {
            // Supervisor call failed — return a minimal fallback single-step plan
            console.error(`[SupervisorRouter] Supervisor call failed for domain "${domain}":`, err.message);
            plan = this.fallbackPlan(domain, task.objective);
        }
        // 3. Execute each step.
        //    Each worker call gets the same deterministic system prompt (memory first).
        const workerSystemPrompt = (0, prompts_1.assembleSystemPrompt)(config.systemHint);
        const executedSteps = [];
        let finalResponse = '';
        for (const step of plan.steps) {
            const stepStart = Date.now();
            try {
                const result = await this.registry.call(step.model, step.prompt, {
                    temperature: 0.3,
                    responseFormat: step.expected_output_shape,
                    systemPrompt: workerSystemPrompt,
                });
                const executed = {
                    ...step,
                    result: result.text,
                    latency_ms: result.latencyMs,
                };
                executedSteps.push(executed);
                finalResponse = result.text; // last step wins as the final response
            }
            catch (err) {
                console.error(`[SupervisorRouter] Step failed (model: ${step.model}):`, err.message);
                // Attempt Groq fallback for failed steps
                try {
                    const fallback = await this.registry.call('groq:llama-3.3-70b-versatile', step.prompt, { temperature: 0.3, systemPrompt: workerSystemPrompt });
                    executedSteps.push({ ...step, result: fallback.text, latency_ms: Date.now() - stepStart });
                    finalResponse = fallback.text;
                }
                catch {
                    executedSteps.push({ ...step, result: `[Step failed: ${err.message}]`, latency_ms: Date.now() - stepStart });
                }
            }
        }
        const totalLatency = Date.now() - routerStart;
        // 4. Publish blackboard updates
        if (Object.keys(plan.blackboard_updates ?? {}).length > 0) {
            this.blackboard.publishMany(task.sessionId, plan.blackboard_updates, config.supervisorRouting, 3600);
        }
        // 5. Record stats
        try {
            SupervisorStatsRepository_1.SupervisorStatsRepository.record(config.name, domain, plan.roi_estimate, totalLatency);
        }
        catch (err) {
            console.warn('[SupervisorRouter] Stats recording failed:', err.message);
        }
        const response = {
            ...plan,
            supervisor: config.name,
            domain,
            steps: executedSteps,
            final_response: finalResponse,
            total_latency_ms: totalLatency,
        };
        // 6. Handle escalation (depth-limited)
        if (plan.escalation && plan.next_supervisor && depth < MAX_ESCALATION_DEPTH) {
            console.log(`[SupervisorRouter] Escalating to "${plan.next_supervisor}" (depth ${depth + 1})`);
            return this.route({
                domain: plan.next_supervisor,
                objective: `[Escalated from ${domain}] ${task.objective}\n\nPrevious result:\n${finalResponse}`,
                sessionId: task.sessionId,
                depth: depth + 1,
            });
        }
        return response;
    }
    /**
     * Parse the supervisor's JSON plan, stripping any markdown fences the
     * model may have added despite instructions.
     */
    parsePlan(raw) {
        const cleaned = raw
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```\s*$/, '')
            .trim();
        try {
            const parsed = JSON.parse(cleaned);
            return {
                model_sequence: parsed.model_sequence ?? [],
                reasoning: parsed.reasoning ?? '',
                steps: Array.isArray(parsed.steps) ? parsed.steps : [],
                blackboard_updates: parsed.blackboard_updates ?? {},
                escalation: parsed.escalation ?? false,
                escalation_reason: parsed.escalation_reason ?? null,
                next_supervisor: parsed.next_supervisor ?? undefined,
                roi_estimate: parsed.roi_estimate ?? 5,
            };
        }
        catch (err) {
            throw new Error(`[SupervisorRouter] Failed to parse supervisor JSON: ${err.message}\nRaw: ${raw.slice(0, 200)}`);
        }
    }
    /** Minimal one-step plan used when the supervisor call itself fails */
    fallbackPlan(domain, objective) {
        const config = prompts_1.DOMAIN_CONFIG[domain];
        const fallbackModel = config.workerRoutings.at(-1) ?? 'groq:llama-3.3-70b-versatile';
        return {
            model_sequence: [fallbackModel],
            reasoning: 'Supervisor call failed — executing direct fallback.',
            steps: [{ model: fallbackModel, prompt: objective, expected_output_shape: 'text' }],
            blackboard_updates: {},
            escalation: false,
            escalation_reason: null,
            roi_estimate: 3,
        };
    }
    /** Expose registry health for the /api/health endpoint */
    async providerHealth() {
        return this.registry.healthCheck();
    }
    /** Expose domain classification for testing */
    static classify(text) {
        return (0, prompts_1.classifyDomain)(text);
    }
}
exports.SupervisorRouter = SupervisorRouter;
