import { SupervisorTask, SupervisorResponse, SupervisorPlan, Step, SupervisorDomain } from '../shared/types';
import { ProviderRegistry } from './providers/ProviderRegistry';
import { GeminiProvider } from './providers/GeminiProvider';
import { GroqProvider } from './providers/GroqProvider';
import { CodexCliProvider } from './providers/CodexCliProvider';
import { Blackboard } from './Blackboard';
import { SupervisorStatsRepository } from '../db/repositories/SupervisorStatsRepository';
import { DOMAIN_CONFIG, buildSupervisorPrompt, classifyDomain, assembleSystemPrompt } from './supervisors/prompts';

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
export class SupervisorRouter {
  private registry: ProviderRegistry;
  private blackboard: Blackboard;

  constructor() {
    this.registry = new ProviderRegistry();
    this.registry
      .register(new GeminiProvider())
      .register(new GroqProvider())
      .register(new CodexCliProvider());

    this.blackboard = new Blackboard();
  }

  async route(task: SupervisorTask): Promise<SupervisorResponse> {
    const depth = task.depth ?? 0;
    const domain = task.domain ?? classifyDomain(task.objective);
    const config = DOMAIN_CONFIG[domain];
    const routerStart = Date.now();

    // 1. Get shared context
    const context = this.blackboard.getContext(task.sessionId);

    // 2. Build and execute the supervisor planning call.
    //    assembleSystemPrompt() is the single authority channel: memory first,
    //    then the base planner prompt.  No separate systemPrompt option is used
    //    so there is exactly one system role message per request.
    const supervisorSystemPrompt = assembleSystemPrompt(
      `You are the ${config.name} for AURA_LOCAL_SYNC v2. ` +
      `${config.systemHint} ` +
      `Produce ONLY valid JSON — no prose, no markdown fences.`,
    );
    const supervisorPrompt = buildSupervisorPrompt(config, task.objective, context);
    let plan: SupervisorPlan;

    try {
      const planResult = await this.registry.call(
        config.supervisorRouting,
        supervisorPrompt,
        { temperature: 0.1, responseFormat: 'json', systemPrompt: supervisorSystemPrompt },
      );
      plan = this.parsePlan(planResult.text);
    } catch (err: any) {
      // Supervisor call failed — return a minimal fallback single-step plan
      console.error(`[SupervisorRouter] Supervisor call failed for domain "${domain}":`, err.message);
      plan = this.fallbackPlan(domain, task.objective);
    }

    // 3. Execute each step.
    //    Each worker call gets the same deterministic system prompt (memory first).
    const workerSystemPrompt = assembleSystemPrompt(config.systemHint);
    const executedSteps: Step[] = [];
    let finalResponse = '';

    for (const step of plan.steps) {
      const stepStart = Date.now();
      try {
        const result = await this.registry.call(
          step.model,
          step.prompt,
          {
            temperature: 0.3,
            responseFormat: step.expected_output_shape,
            systemPrompt: workerSystemPrompt,
          },
        );
        const executed: Step = {
          ...step,
          result:     result.text,
          latency_ms: result.latencyMs,
        };
        executedSteps.push(executed);
        finalResponse = result.text; // last step wins as the final response
      } catch (err: any) {
        console.error(`[SupervisorRouter] Step failed (model: ${step.model}):`, err.message);
        // Attempt Groq fallback for failed steps
        try {
          const fallback = await this.registry.call(
            'groq:llama-3.3-70b-versatile',
            step.prompt,
            { temperature: 0.3, systemPrompt: workerSystemPrompt },
          );
          executedSteps.push({ ...step, result: fallback.text, latency_ms: Date.now() - stepStart });
          finalResponse = fallback.text;
        } catch {
          executedSteps.push({ ...step, result: `[Step failed: ${err.message}]`, latency_ms: Date.now() - stepStart });
        }
      }
    }

    const totalLatency = Date.now() - routerStart;

    // 4. Publish blackboard updates
    if (Object.keys(plan.blackboard_updates ?? {}).length > 0) {
      this.blackboard.publishMany(
        task.sessionId,
        plan.blackboard_updates,
        config.supervisorRouting,
        3600, // 1-hour TTL
      );
    }

    // 5. Record stats
    try {
      SupervisorStatsRepository.record(config.name, domain, plan.roi_estimate, totalLatency);
    } catch (err: any) {
      console.warn('[SupervisorRouter] Stats recording failed:', err.message);
    }

    const response: SupervisorResponse = {
      ...plan,
      supervisor:      config.name,
      domain,
      steps:           executedSteps,
      final_response:  finalResponse,
      total_latency_ms: totalLatency,
    };

    // 6. Handle escalation (depth-limited)
    if (plan.escalation && plan.next_supervisor && depth < MAX_ESCALATION_DEPTH) {
      console.log(`[SupervisorRouter] Escalating to "${plan.next_supervisor}" (depth ${depth + 1})`);
      return this.route({
        domain:    plan.next_supervisor as SupervisorDomain,
        objective: `[Escalated from ${domain}] ${task.objective}\n\nPrevious result:\n${finalResponse}`,
        sessionId: task.sessionId,
        depth:     depth + 1,
      });
    }

    return response;
  }

  /**
   * Parse the supervisor's JSON plan, stripping any markdown fences the
   * model may have added despite instructions.
   */
  private parsePlan(raw: string): SupervisorPlan {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      return {
        model_sequence:    parsed.model_sequence    ?? [],
        reasoning:         parsed.reasoning         ?? '',
        steps:             Array.isArray(parsed.steps) ? parsed.steps : [],
        blackboard_updates: parsed.blackboard_updates ?? {},
        escalation:        parsed.escalation        ?? false,
        escalation_reason: parsed.escalation_reason ?? null,
        next_supervisor:   parsed.next_supervisor   ?? undefined,
        roi_estimate:      parsed.roi_estimate       ?? 5,
      };
    } catch (err: any) {
      throw new Error(`[SupervisorRouter] Failed to parse supervisor JSON: ${err.message}\nRaw: ${raw.slice(0, 200)}`);
    }
  }

  /** Minimal one-step plan used when the supervisor call itself fails */
  private fallbackPlan(domain: SupervisorDomain, objective: string): SupervisorPlan {
    const config = DOMAIN_CONFIG[domain];
    const fallbackModel = config.workerRoutings.at(-1) ?? 'groq:llama-3.3-70b-versatile';
    return {
      model_sequence:    [fallbackModel],
      reasoning:         'Supervisor call failed — executing direct fallback.',
      steps:             [{ model: fallbackModel, prompt: objective, expected_output_shape: 'text' }],
      blackboard_updates: {},
      escalation:        false,
      escalation_reason: null,
      roi_estimate:      3,
    };
  }

  /** Expose registry health for the /api/health endpoint */
  async providerHealth(): Promise<Record<string, boolean>> {
    return this.registry.healthCheck();
  }

  /** Expose domain classification for testing */
  static classify(text: string): SupervisorDomain {
    return classifyDomain(text);
  }
}

