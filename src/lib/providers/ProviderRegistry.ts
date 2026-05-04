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
import { VertexProvider } from './VertexProvider';
import { getOpenRouterProviderSync, createOpenRouterProvider } from './OpenRouterProvider';

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

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: 'groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant',
    rpm: 30,
    format: 'openai',
    models: [
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        free: true,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Fast, low-latency 8B model; free tier limit 30 RPM / 5000 requests per day',
      },
      {
        id: 'llama-3.1-70b-versatile',
        name: 'Llama 3.1 70B Versatile',
        free: true,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Higher capability 70B model; same free tier limits as 8B',
      },
      {
        id: 'llama-3.2-1b-instant',
        name: 'Llama 3.2 1B Instant',
        free: true,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Ultra-low latency 1B model for simple tasks',
      },
      {
        id: 'llama-3.2-3b-instant',
        name: 'Llama 3.2 3B Instant',
        free: true,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Balanced 3B model for medium complexity tasks',
      },
      {
        id: 'llama-3.3-8b-versatile',
        name: 'Llama 3.3 8B Versatile',
        free: true,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Latest 8B Llama model (March 2026 release)',
      },
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B Versatile',
        free: true,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Latest 70B Llama model (March 2026 release)',
      },
      {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B',
        free: true,
        rpm: 30,
        contextWindow: 32768,
        notes: 'Open mixture-of-experts model',
      },
      {
        id: 'mixtral-8x22b-32768',
        name: 'Mixtral 8x22B',
        free: true,
        rpm: 30,
        contextWindow: 32768,
        notes: 'Larger mixture-of-experts model with higher capability',
      },
      {
        id: 'gemma-2-9b-it',
        name: 'Gemma 2 9B IT',
        free: true,
        rpm: 30,
        contextWindow: 8192,
        notes: "Google's open 9B instruction-tuned model",
      },
      {
        id: 'gemma-2-27b-it',
        name: 'Gemma 2 27B IT',
        free: true,
        rpm: 30,
        contextWindow: 8192,
        notes: "Google's open 27B instruction-tuned model",
      },
      {
        id: 'qwen-2.5-7b-instruct',
        name: 'Qwen 2.5 7B Instruct',
        free: true,
        rpm: 30,
        contextWindow: 32768,
        notes: "Alibaba's 7B instruction-tuned model",
      },
      {
        id: 'qwen-2.5-72b-instruct',
        name: 'Qwen 2.5 72B Instruct',
        free: true,
        rpm: 30,
        contextWindow: 32768,
        notes: "Alibaba's 72B instruction-tuned model",
      },
    ],
  },
  {
    id: 'vertex',
    envKey: 'GOOGLE_CLOUD_PROJECT',
    baseUrl: '',
    defaultModel: 'gemini-2.5-flash',
    rpm: 60,
    format: 'vertex',
    models: [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        free: false,
        rpm: 60,
        contextWindow: 1048576,
        notes: 'Vertex AI default model; paid only (free trial credits available); 1M token context',
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        free: false,
        rpm: 30,
        contextWindow: 1048576,
        notes: 'High-capability Gemini model for complex tasks; 1M token context',
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        free: false,
        rpm: 60,
        contextWindow: 1048576,
        notes: 'Stable previous generation Flash model',
      },
      {
        id: 'gemini-2.0-pro',
        name: 'Gemini 2.0 Pro',
        free: false,
        rpm: 30,
        contextWindow: 1048576,
        notes: 'Stable previous generation Pro model',
      },
      {
        id: 'llama-3.3-70b-instruct',
        name: 'Llama 3.3 70B Instruct',
        free: false,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Hosted Llama 3.3 70B on Vertex AI',
      },
      {
        id: 'llama-3.3-8b-instruct',
        name: 'Llama 3.3 8B Instruct',
        free: false,
        rpm: 60,
        contextWindow: 131072,
        notes: 'Hosted Llama 3.3 8B on Vertex AI',
      },
      {
        id: 'mistral-large-2',
        name: 'Mistral Large 2',
        free: false,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Hosted Mistral Large 2 on Vertex AI',
      },
      {
        id: 'claude-3-7-sonnet',
        name: 'Claude 3.7 Sonnet',
        free: false,
        rpm: 30,
        contextWindow: 200000,
        notes: 'Anthropic Claude 3.7 Sonnet hosted on Vertex AI (200k context)',
      },
    ],
    notes: 'Base URL is dynamically constructed per region, e.g., https://us-central1-aiplatform.googleapis.com/v1',
  },
  {
    id: 'google',
    envKey: 'GOOGLE_AI_STUDIO_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    rpm: 10,
    format: 'google',
    models: [
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        free: true,
        rpm: 10,
        contextWindow: 1048576,
        notes: 'Free tier: 10 RPM / 1000 requests per day; paid tier: 60 RPM',
      },
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        free: true,
        rpm: 5,
        contextWindow: 1048576,
        notes: 'Free tier: 5 RPM / 500 requests per day; paid tier: 30 RPM',
      },
      {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        free: true,
        rpm: 10,
        contextWindow: 1048576,
        notes: 'Stable previous generation Flash model; same free tier limits as 2.5 Flash',
      },
      {
        id: 'gemini-2.0-pro',
        name: 'Gemini 2.0 Pro',
        free: true,
        rpm: 5,
        contextWindow: 1048576,
        notes: 'Stable previous generation Pro model; same free tier limits as 2.5 Pro',
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        free: true,
        rpm: 10,
        contextWindow: 1048576,
        notes: 'Legacy 1.5 series Flash model; still supported',
      },
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        free: true,
        rpm: 5,
        contextWindow: 1048576,
        notes: 'Legacy 1.5 series Pro model; still supported',
      },
    ],
  },
  // OpenRouter will be added dynamically in the constructor
  {
    id: 'openrouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    rpm: 20,
    format: 'openai',
    models: [], // Will be populated asynchronously
    notes: 'OpenRouter supports 500+ models across 50+ providers. Models fetched dynamically.',
  },
  {
    id: 'mistral',
    envKey: 'MISTRAL_API_KEY',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    rpm: 60,
    format: 'openai',
    models: [
      {
        id: 'mistral-small-latest',
        name: 'Mistral Small Latest',
        free: true,
        rpm: 60,
        contextWindow: 131072,
        notes: 'Default Mistral model; free tier 60 RPM / 1000 requests per day',
      },
      {
        id: 'mistral-medium-latest',
        name: 'Mistral Medium Latest',
        free: true,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Mid-tier Mistral model; free tier access available',
      },
      {
        id: 'mistral-large-latest',
        name: 'Mistral Large Latest',
        free: false,
        rpm: 20,
        contextWindow: 131072,
        notes: 'Highest capability Mistral model; paid only',
      },
      {
        id: 'mistral-nemo-latest',
        name: 'Mistral Nemo Latest',
        free: true,
        rpm: 60,
        contextWindow: 131072,
        notes: "Mistral's Nemo model for general tasks; free tier access",
      },
      {
        id: 'codestral-latest',
        name: 'Codestral Latest',
        free: true,
        rpm: 60,
        contextWindow: 262144,
        notes: "Mistral's code-specific model; 262k context window",
      },
      {
        id: 'mistral-7b-instruct-v0.3',
        name: 'Mistral 7B Instruct v0.3',
        free: true,
        rpm: 60,
        contextWindow: 32768,
        notes: 'Legacy 7B Mistral model; still supported',
      },
      {
        id: 'mixtral-8x7b-instruct-v0.1',
        name: 'Mixtral 8x7B Instruct v0.1',
        free: true,
        rpm: 60,
        contextWindow: 32768,
        notes: 'Legacy Mixtral 8x7B model; still supported',
      },
    ],
  },
  {
    id: 'cohere',
    envKey: 'COHERE_API_KEY',
    baseUrl: 'https://api.cohere.com/compatibility/v1',
    defaultModel: 'command-a-03-2025',
    rpm: 20,
    format: 'openai',
    models: [
      {
        id: 'command-a-03-2025',
        name: 'Command A (March 2025)',
        free: true,
        rpm: 20,
        contextWindow: 131072,
        notes: 'Latest Cohere Command model; free tier 20 RPM / 1000 requests per day',
      },
      {
        id: 'command-r-plus-08-2024',
        name: 'Command R+ (August 2024)',
        free: false,
        rpm: 10,
        contextWindow: 131072,
        notes: 'High-capability R+ model; paid only',
      },
      {
        id: 'command-r-08-2024',
        name: 'Command R (August 2024)',
        free: true,
        rpm: 20,
        contextWindow: 131072,
        notes: 'Stable Command R model; free tier access',
      },
      {
        id: 'command-light-2024',
        name: 'Command Light 2024',
        free: true,
        rpm: 20,
        contextWindow: 32768,
        notes: 'Lightweight Command model for simple tasks; free tier access',
      },
      {
        id: 'embed-english-v3.0',
        name: 'Embed English v3.0',
        free: true,
        rpm: 20,
        contextWindow: 512,
        notes: 'English embedding model; free tier access',
      },
      {
        id: 'embed-multilingual-v3.0',
        name: 'Embed Multilingual v3.0',
        free: true,
        rpm: 20,
        contextWindow: 512,
        notes: 'Multilingual embedding model; free tier access',
      },
    ],
  },
  {
    id: 'deepseek',
    envKey: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v3',
    rpm: 30,
    format: 'openai',
    models: [
      {
        id: 'deepseek-v3',
        name: 'DeepSeek V3',
        free: true,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Latest DeepSeek model; free tier 30 RPM / 5000 requests per day',
      },
      {
        id: 'deepseek-v2.5',
        name: 'DeepSeek V2.5',
        free: true,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Previous generation DeepSeek model; still supported',
      },
      {
        id: 'deepseek-coder-v2-instruct',
        name: 'DeepSeek Coder V2 Instruct',
        free: true,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Code-specific DeepSeek model',
      },
      {
        id: 'deepseek-math-v2',
        name: 'DeepSeek Math V2',
        free: true,
        rpm: 30,
        contextWindow: 131072,
        notes: 'Math-specialized DeepSeek model',
      },
      {
        id: 'deepseek-lite',
        name: 'DeepSeek Lite',
        free: true,
        rpm: 60,
        contextWindow: 131072,
        notes: 'Low-latency Lite model for simple tasks; higher RPM',
      },
    ],
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

  // Provider configs (may be updated asynchronously)
  private providerConfigs: ProviderConfig[] = [];

  // Promise that resolves when async initialization is complete
  private initializationPromise: Promise<void>;

  constructor() {
    // Initialize with sync configs first (including OpenRouter sync version)
    this.providerConfigs = [...PROVIDER_CONFIGS];

    for (const cfg of this.providerConfigs) {
      this.usageLog.set(cfg.id, []);
    }

    // Register VertexProvider for better error handling and validation
    this.register(new VertexProvider());

    // Asynchronously update OpenRouter models if API key is available
    this.initializationPromise = this.updateOpenRouterModels();
  }

  /**
   * Wait for async initialization (OpenRouter model fetching) to complete.
   * This is useful when you need the full model list before proceeding.
   */
  async waitForInitialization(): Promise<void> {
    await this.initializationPromise;
  }

  /**
   * Update OpenRouter provider with dynamically fetched models
   */
  private async updateOpenRouterModels(): Promise<void> {
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
    const withKeys = this.providerConfigs.filter(cfg => !!process.env[cfg.envKey]);
    const withoutKeys = this.providerConfigs.filter(cfg => !process.env[cfg.envKey]);

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
    const available = this.providerConfigs.filter(cfg => !!process.env[cfg.envKey]);

    available.sort((a, b) => {
      const aLoad = this.recentCallCount(a.id, a.rpm) / a.rpm;
      const bLoad = this.recentCallCount(b.id, b.rpm) / b.rpm;
      return aLoad - bLoad;
    });

    if (preferred) {
      const prefId = preferred.includes(':') ? preferred.split(':') : preferred;
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

      // Use the explicitly requested model if it belongs to the current provider, otherwise fallback to default
      const targetModel = (opts.preferred && opts.preferred.startsWith(`${cfg.id}:`))
        ? opts.preferred.substring(cfg.id.length + 1)
        : cfg.defaultModel;

      try {
        const result = await callProvider(targetModel, messages, {
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
    for (const cfg of this.providerConfigs) {
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
