/**
 * ProviderRegistry — multi-provider config table with usage-aware routing.
 *
 * Six built-in providers; selection via getAvailableProvider() picks the one
 * with a valid API key and the lowest recent call count within its RPM window.
 *
 * Public interface is backwards-compatible with the old class so existing
 * agents (BaseAgent.isProviderHealthy / registry.call) compile unchanged.
 */

import { callProvider, CallerMessage, CallerResult, ProviderFormat } from './UnifiedCaller';
import type {
  ModelProvider as LegacyModelProvider,
  CallOptions,
  ProviderResult,
} from './types';

// ── Provider config ────────────────────────────────────────────────────────

export interface ProviderConfig {
  id: string;
  envKey: string;
  baseUrl: string;
  defaultModel: string;
  rpm: number;
  format: ProviderFormat;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id:           'groq',
    envKey:       'GROQ_API_KEY',
    baseUrl:      'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant',
    rpm:          30,
    format:       'openai',
  },
  {
    id:           'google',
    envKey:       'GOOGLE_AI_STUDIO_API_KEY',
    baseUrl:      'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    rpm:          10,
    format:       'google',
  },
  {
    id:           'openrouter',
    envKey:       'OPENROUTER_API_KEY',
    baseUrl:      'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    rpm:          20,
    format:       'openai',
  },
  {
    id:           'mistral',
    envKey:       'MISTRAL_API_KEY',
    baseUrl:      'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    rpm:          60,
    format:       'openai',
  },
  {
    id:           'cohere',
    envKey:       'COHERE_API_KEY',
    baseUrl:      'https://api.cohere.com/v2',
    defaultModel: 'command-r-plus',
    rpm:          20,
    format:       'openai',
  },
  {
    id:           'deepseek',
    envKey:       'DEEPSEEK_API_KEY',
    baseUrl:      'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v3',
    rpm:          30,
    format:       'openai',
  },
];

// ── Re-export legacy types so existing imports from ProviderRegistry still compile ──

export type { CallOptions, ProviderResult, ModelProvider } from './types';

// Unified ProviderResult returned by callWithFallback (superset of legacy).
export interface ExtendedProviderResult extends CallerResult {
  provider: string;
  rateLimited: boolean;
  toolCalls?: any[];
  skipped: string[];
}

// ── Registry ───────────────────────────────────────────────────────────────

export class ProviderRegistry {
  // Usage log: maps providerId → array of call timestamps (ms).
  private readonly usageLog = new Map<string, number[]>();

  // Legacy shim: concrete ModelProvider adapters registered by old code.
  // Kept so SupervisorRouter (which calls register()) still compiles.
  private readonly legacyAdapters = new Map<string, LegacyModelProvider>();

  constructor() {
    for (const cfg of PROVIDER_CONFIGS) {
      this.usageLog.set(cfg.id, []);
    }
  }

  // ── Legacy register() shim — accepts old provider adapters ──────────────

  register(provider: LegacyModelProvider): this {
    this.legacyAdapters.set(provider.id, provider);
    if (!this.usageLog.has(provider.id)) {
      this.usageLog.set(provider.id, []);
    }
    return this;
  }

  // ── Usage tracking ────────────────────────────────────────────────────────

  logUsage(providerId: string): void {
    const now = Date.now();
    const log = this.usageLog.get(providerId) ?? [];
    log.push(now);
    this.usageLog.set(providerId, log);
  }

  private recentCallCount(providerId: string, rpm: number): number {
    const windowMs = 60_000;
    const cutoff = Date.now() - windowMs;
    const log = this.usageLog.get(providerId) ?? [];
    // Prune stale entries in place.
    const fresh = log.filter(t => t >= cutoff);
    this.usageLog.set(providerId, fresh);
    return fresh.length;
  }

  // ── Provider selection ────────────────────────────────────────────────────

  /**
   * Return configs for all providers that have a valid API key, ordered by
   * ascending recent usage (calls in the last 60s / RPM).  If `preferred` is
   * given and available, it is placed first regardless of usage.
   */
  getAvailableProviders(preferred?: string): ProviderConfig[] {
    const available = PROVIDER_CONFIGS.filter(cfg => !!process.env[cfg.envKey]);

    available.sort((a, b) => {
      const aLoad = this.recentCallCount(a.id, a.rpm) / a.rpm;
      const bLoad = this.recentCallCount(b.id, b.rpm) / b.rpm;
      return aLoad - bLoad;
    });

    if (preferred) {
      const idx = available.findIndex(c => c.id === preferred);
      if (idx > 0) {
        const [p] = available.splice(idx, 1);
        available.unshift(p);
      }
    }

    return available;
  }

  /**
   * Return the single best available provider (lowest relative load).
   * Optionally bias towards `preferred` if it is available.
   */
  getAvailableProvider(preferred?: string): ProviderConfig | null {
    return this.getAvailableProviders(preferred)[0] ?? null;
  }

  // ── Unified call (new path) ───────────────────────────────────────────────

  /**
   * Call a specific provider+model directly, with usage tracking.
   * Routing string: "providerId:modelId" or bare "modelId" (uses first available).
   *
   * Preserved for backwards-compat with agents that call registry.call(routing, prompt, opts).
   */
  async call(
    routing: string,
    prompt: string,
    opts: CallOptions = {},
  ): Promise<ProviderResult> {
    const { providerId, modelId } = this.parseRouting(routing);
    const cfg = PROVIDER_CONFIGS.find(c => c.id === providerId);

    // Fall back to legacy adapter if no config entry (e.g. 'perplexity', 'gemini' old-style).
    if (!cfg) {
      const adapter = this.legacyAdapters.get(providerId);
      if (!adapter) {
        throw new Error(
          `[ProviderRegistry] Unknown provider "${providerId}". ` +
          `Known: ${PROVIDER_CONFIGS.map(c => c.id).join(', ')}`,
        );
      }
      const r = await adapter.call(modelId, prompt, opts);
      return { ...r, provider: providerId, rateLimited: r.rateLimited ?? false };
    }

    const apiKey = process.env[cfg.envKey] ?? '';
    if (!apiKey) {
      throw new Error(`[ProviderRegistry] ${cfg.envKey} is not set for provider "${providerId}"`);
    }

    const messages: CallerMessage[] = opts.messages
      ? (opts.messages as CallerMessage[])
      : [
          ...(opts.systemPrompt ? [{ role: 'system' as const, content: opts.systemPrompt }] : []),
          { role: 'user' as const, content: prompt },
        ];

    this.logUsage(providerId);
    this.debugOutboundMessages(`call:${providerId}:${modelId}`, messages);

    const result = await callProvider(modelId, messages, {
      format:      cfg.format,
      baseUrl:     cfg.baseUrl,
      apiKey,
      providerId,
      temperature: opts.temperature,
      maxTokens:   opts.maxTokens,
      tools:       opts.tools,
    });

    return { ...result, provider: providerId, rateLimited: result.rateLimited };
  }

  // ── Multi-provider call with automatic fallback ───────────────────────────

  /**
   * Try each available provider in load-sorted order.  On 429 or thrown error,
   * immediately continue to the next with zero delay.  Returns the first
   * successful CallerResult or throws if all fail.
   *
   * `preferred` biases the sort toward a specific provider id.
   */
  async callWithFallback(
    prompt: string,
    opts: CallOptions & { preferred?: string } = {},
  ): Promise<ProviderResult & { skipped: string[] }> {
    const providers = this.getAvailableProviders(opts.preferred);

    if (providers.length === 0) {
      throw new Error('[ProviderRegistry] No providers have a valid API key configured.');
    }

    const skipped: string[] = [];

    for (const cfg of providers) {
      const apiKey = process.env[cfg.envKey] ?? '';

      // Honor pre-built messages array when provided; otherwise build from prompt + systemPrompt.
      const messages: CallerMessage[] = opts.messages
        ? (opts.messages as CallerMessage[])
        : [
            ...(opts.systemPrompt ? [{ role: 'system' as const, content: opts.systemPrompt }] : []),
            { role: 'user' as const, content: prompt },
          ];

      this.logUsage(cfg.id);
      this.debugOutboundMessages(`callWithFallback:${cfg.id}:${cfg.defaultModel}`, messages);

      try {
        const result = await callProvider(cfg.defaultModel, messages, {
          format:      cfg.format,
          baseUrl:     cfg.baseUrl,
          apiKey,
          providerId:  cfg.id,
          temperature: opts.temperature,
          maxTokens:   opts.maxTokens,
        });

        if (result.rateLimited || !result.text) {
          const reason = result.errorMessage ?? `${cfg.id} returned no content`;
          console.warn(`[ProviderRegistry] ${cfg.id} skipped: ${reason}`);
          skipped.push(`${cfg.id}: ${reason}`);
          continue;
        }

        console.log(
          `[ProviderRegistry] Served by ${cfg.id}:${cfg.defaultModel} ` +
          `(${result.latencyMs}ms${skipped.length ? `, skipped: ${skipped.join(' | ')}` : ''})`,
        );

        return {
          ...result,
          provider:    cfg.id,
          rateLimited: false,
          skipped,
        };
      } catch (err: any) {
        const reason = err.message ?? String(err);
        console.warn(`[ProviderRegistry] ${cfg.id} threw: ${reason} — trying next.`);
        skipped.push(`${cfg.id}: ${reason}`);
      }
    }

    throw new Error(
      `[ProviderRegistry] All providers failed: ${skipped.join(' | ')}`,
    );
  }

  // ── Health check ──────────────────────────────────────────────────────────

  /** Returns a map of providerId → whether an API key is configured. */
  async healthCheck(): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const cfg of PROVIDER_CONFIGS) {
      result[cfg.id] = !!process.env[cfg.envKey];
    }
    // Also include any legacy adapters registered via register().
    for (const [id, adapter] of this.legacyAdapters) {
      if (!(id in result)) {
        result[id] = await adapter.isAvailable().catch(() => false);
      }
    }
    return result;
  }

  listProviders(): string[] {
    const fromConfig = PROVIDER_CONFIGS.map(c => c.id);
    const fromLegacy = [...this.legacyAdapters.keys()];
    return [...new Set([...fromConfig, ...fromLegacy])];
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private parseRouting(routing: string): { providerId: string; modelId: string } {
    if (routing.includes(':')) {
      const idx = routing.indexOf(':');
      return { providerId: routing.slice(0, idx), modelId: routing.slice(idx + 1) };
    }
    // No prefix — pick best available provider.
    const best = this.getAvailableProvider();
    if (!best) throw new Error('[ProviderRegistry] No providers available');
    return { providerId: best.id, modelId: routing };
  }

  private debugOutboundMessages(path: string, messages: CallerMessage[]): void {
    const systemMessages = messages.filter(m => m.role === 'system');

    // Probe whether memory is present by checking for the SOUL section header,
    // which is a stable short string independent of the full memory length.
    const MEMORY_MARKER = '## AURA Identity (SOUL)';
    const memoryPresent = systemMessages.some(m => m.content?.includes(MEMORY_MARKER));
    const multipleSystemChannels = systemMessages.length > 1;

    console.log(
      `[LLM DEBUG] path=${path} ` +
      `messages=${messages.length} ` +
      `roles=${messages.map(m => m.role).join(',')} ` +
      `system_count=${systemMessages.length} ` +
      `memory_present=${memoryPresent} ` +
      `multiple_system_channels=${multipleSystemChannels}`,
    );

    systemMessages.forEach((m, i) => {
      const c = m.content ?? '';
      console.log(
        `[LLM DEBUG] system[${i}] len=${c.length} ` +
        `first120=${JSON.stringify(c.slice(0, 120))}`,
      );
    });

    if (multipleSystemChannels) {
      console.warn(
        `[LLM DEBUG] WARNING: ${path} has ${systemMessages.length} system messages — ` +
        `this splits authority and may weaken memory. Collapse to one.`,
      );
    }
  }
}
