/**
 * ProviderRegistry — multi-provider config table with usage-aware routing.
 *
 * OpenRouter-only registry; selection stays usage-aware but all traffic routes
 * through the single configured provider.
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
import { getOpenRouterProviderSync, createOpenRouterProvider } from './OpenRouterProvider';
import { getGroqProviderSync, createGroqProvider } from './GroqProvider';
import { hasKey, resolveKey, isUserKey } from './ByokStore';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Race a promise against a timeout.  If the timeout fires first the returned
 * promise rejects with an informative error.  No special cleanup is needed —
 * the rejected timeout callback is a no-op if the original promise settles
 * first (JavaScript ignores rejections on already-settled promises).
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'LLM call',
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(
        `[Timeout] ${label} timed out after ${ms}ms — ` +
        `the provider may be overloaded or the free-tier rate limit is too slow.`,
      )), ms),
    ),
  ]);
}

// ── Provider config ────────────────────────────────────────────────────────

export interface ModelConfig {
  /** Unique model ID used in API requests */
  id: string;
  /** Human-readable model name */
  name: string;
  /** Whether the model is accessible on a free tier (true) or paid-only (false) */
  free: boolean;
  /** Standard rate limit: Requests Per Minute (RPM) for free tier, or default paid tier */
  rpm: number;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Optional notes about the model (e.g., deprecation, special features) */
  notes?: string;
}

export interface ProviderConfig {
  /** Unique provider identifier */
  id: string;
  /** Environment variable key for the provider's API key */
  envKey: string;
  /** Base URL for the provider's API (empty if dynamically constructed, e.g., Vertex AI) */
  baseUrl: string;
  /** Default model ID to use if no model is specified */
  defaultModel: string;
  /** Provider-level default RPM (fallback if model-level RPM is not set) */
  rpm: number;
  /** API format type (e.g., "openai", "vertex", "google") */
  format: ProviderFormat;
  /** List of all currently available models for this provider (as of April 30, 2026) */
  models: ModelConfig[];
  /** Optional notes about the provider */
  notes?: string;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [getOpenRouterProviderSync(), getGroqProviderSync()];

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

  // Provider configs (may be updated asynchronously)
  private providerConfigs: ProviderConfig[] = [];

  // Promise that resolves when async initialization is complete
  private initializationPromise: Promise<void>;

  constructor() {
    // Initialize with sync configs first (including OpenRouter + Groq sync versions)
    this.providerConfigs = [...PROVIDER_CONFIGS];

    for (const cfg of this.providerConfigs) {
      this.usageLog.set(cfg.id, []);
    }

    // Asynchronously update provider models if API keys are available
    this.initializationPromise = this.updateProviderModels();
  }

  /**
   * Wait for async initialization (model fetching) to complete.
   * This is useful when you need the full model list before proceeding.
   */
  async waitForInitialization(): Promise<void> {
    await this.initializationPromise;
  }

  /**
   * Update all providers with dynamically fetched models
   */
  private async updateProviderModels(): Promise<void> {
    // Update OpenRouter
    try {
      const openRouterConfig = await createOpenRouterProvider();
      const index = this.providerConfigs.findIndex(cfg => cfg.id === 'openrouter');
      if (index >= 0) {
        this.providerConfigs[index] = openRouterConfig;
        console.log(`[ProviderRegistry] Updated OpenRouter with ${openRouterConfig.models.length} models`);
      }
    } catch (error) {
      console.error('[ProviderRegistry] Failed to update OpenRouter models:', error);
    }

    // Update Groq
    try {
      const groqConfig = await createGroqProvider();
      const index = this.providerConfigs.findIndex(cfg => cfg.id === 'groq');
      if (index >= 0) {
        this.providerConfigs[index] = groqConfig;
        console.log(`[ProviderRegistry] Updated Groq with ${groqConfig.models.length} models`);
      }
    } catch (error) {
      console.error('[ProviderRegistry] Failed to update Groq models:', error);
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
   * Return configs for ALL providers (regardless of API key status), ordered by
   * ascending recent usage (calls in the last 60s / RPM) for those with keys.
   * Providers without API keys are appended at the end.
   * If `preferred` is given and available, it is placed first regardless of usage.
   */
  getAllProviders(preferred?: string): ProviderConfig[] {
    const withKeys = this.providerConfigs.filter(cfg => hasKey(cfg.id, cfg.envKey));
    const withoutKeys = this.providerConfigs.filter(cfg => !hasKey(cfg.id, cfg.envKey));

    // Sort providers with keys by load
    withKeys.sort((a, b) => {
      const aLoad = this.recentCallCount(a.id, a.rpm) / (a.rpm || 1);
      const bLoad = this.recentCallCount(b.id, b.rpm) / (b.rpm || 1);
      return aLoad - bLoad;
    });

    // Combine: with keys first (sorted), then without keys
    const all = [...withKeys, ...withoutKeys];

    if (preferred) {
      const prefId = preferred.includes(':') ? preferred.split(':')[0] : preferred;
      const idx = all.findIndex(c => c.id === prefId);
      if (idx > 0) {
        const [p] = all.splice(idx, 1);
        all.unshift(p);
      }
    }

    return all;
  }

  /**
   * Return configs for all providers that have a valid API key, ordered by
   * ascending recent usage (calls in the last 60s / RPM).  If `preferred` is
   * given and available, it is placed first regardless of usage.
   * (Kept for backward compatibility with agents)
   */
  getAvailableProviders(preferred?: string): ProviderConfig[] {
    const available = this.providerConfigs.filter(cfg => hasKey(cfg.id, cfg.envKey));

    available.sort((a, b) => {
      const aLoad = this.recentCallCount(a.id, a.rpm) / a.rpm;
      const bLoad = this.recentCallCount(b.id, b.rpm) / b.rpm;
      return aLoad - bLoad;
    });

    if (preferred) {
      const prefId = preferred.includes(':') ? preferred.split(':')[0] : preferred;
      const idx = available.findIndex(c => c.id === prefId);
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
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const { providerId, modelId } = this.parseRouting(routing);
    const cfg = this.providerConfigs.find(c => c.id === providerId);

    // Fall back to legacy adapter if no config entry (e.g. 'perplexity', 'gemini' old-style).
    if (!cfg) {
      const adapter = this.legacyAdapters.get(providerId);
      if (!adapter) {
        throw new Error(
          `[ProviderRegistry] Unknown provider "${providerId}". ` +
          `Known: ${this.providerConfigs.map(c => c.id).join(', ')}`,
        );
      }
      const r = await withTimeout(
        adapter.call(modelId, prompt, opts),
        timeoutMs,
        `legacy:${providerId}:${modelId}`,
      );
      return { ...r, provider: providerId, rateLimited: r.rateLimited ?? false };
    }

    const apiKey = resolveKey(cfg.id, cfg.envKey);
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

    const result = await withTimeout(
      callProvider(modelId, messages, {
        format:      cfg.format,
        baseUrl:     cfg.baseUrl,
        apiKey,
        providerId,
        temperature: opts.temperature,
        maxTokens:   opts.maxTokens,
        tools:       opts.tools,
      }),
      timeoutMs,
      `${providerId}:${modelId}`,
    );

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
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const providers = this.getAvailableProviders(opts.preferred);

    if (providers.length === 0) {
      throw new Error('[ProviderRegistry] No providers have a valid API key configured.');
    }

    const skipped: string[] = [];

    for (const cfg of providers) {
      const apiKey = resolveKey(cfg.id, cfg.envKey);

      // Honor pre-built messages array when provided; otherwise build from prompt + systemPrompt.
      const messages: CallerMessage[] = opts.messages
        ? (opts.messages as CallerMessage[])
        : [
            ...(opts.systemPrompt ? [{ role: 'system' as const, content: opts.systemPrompt }] : []),
            { role: 'user' as const, content: prompt },
          ];

      this.logUsage(cfg.id);
      this.debugOutboundMessages(`callWithFallback:${cfg.id}:${cfg.defaultModel}`, messages);

      // Use the explicitly requested model if it belongs to the current provider, otherwise fallback to default
      const targetModel = (opts.preferred && opts.preferred.startsWith(`${cfg.id}:`))
        ? opts.preferred.substring(cfg.id.length + 1)
        : cfg.defaultModel;

      try {
        const result = await withTimeout(
          callProvider(targetModel, messages, {
            format:      cfg.format,
            baseUrl:     cfg.baseUrl,
            apiKey,
            providerId:  cfg.id,
            temperature: opts.temperature,
            maxTokens:   opts.maxTokens,
          }),
          timeoutMs,
          `${cfg.id}:${targetModel}`,
        );

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

  /** Returns a map of providerId → whether an API key is configured (BYOK or env). */
  async healthCheck(): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const cfg of this.providerConfigs) {
      result[cfg.id] = hasKey(cfg.id, cfg.envKey);
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
    const fromConfig = this.providerConfigs.map(c => c.id);
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
