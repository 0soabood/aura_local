import { ModelProvider, CallOptions, ProviderResult } from './types';

const PERPLEXITY_API_BASE = 'https://api.perplexity.ai';

/**
 * Perplexity provider — search-augmented, OpenAI-compatible API.
 *
 * Best suited for: live market intel, web-sourced research, fact retrieval.
 * NOT suited for: pure synthesis, code generation, or long-form reasoning.
 *
 * Recommended models:
 *   Search-augmented : perplexity:llama-3.1-sonar-large-128k-online
 *   Pro search       : perplexity:sonar-pro
 */
export class PerplexityProvider implements ModelProvider {
  readonly id = 'perplexity';
  readonly supportedModels = [
    'llama-3.1-sonar-large-128k-online',
    'llama-3.1-sonar-small-128k-online',
    'sonar-pro',
    'sonar',
  ];

  constructor(private readonly apiKey = process.env.PERPLEXITY_API_KEY ?? '') {}

  async call(model: string, prompt: string, opts: CallOptions = {}): Promise<ProviderResult> {
    if (!this.apiKey) throw new Error('[PerplexityProvider] PERPLEXITY_API_KEY not set');

    const start = Date.now();
    const messages: { role: string; content: string }[] = [];

    if (opts.systemPrompt) {
      messages.push({ role: 'system', content: opts.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${PERPLEXITY_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature:       opts.temperature ?? 0.2,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
    });

    // Normalise 429 to rateLimited result so callers can chain to the next
    // provider without catching a thrown error.
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
      const validRetry = retrySeconds !== undefined && !isNaN(retrySeconds) ? retrySeconds : undefined;
      return {
        text:              '',
        model,
        provider:          this.id,
        tokensIn:          0,
        tokensOut:         0,
        latencyMs:         Date.now() - start,
        rateLimited:       true,
        retryAfterSeconds: validRetry,
        errorMessage:      validRetry
          ? `Perplexity rate limit exceeded. Retry after ${validRetry}s.`
          : 'Perplexity rate limit exceeded.',
      };
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[PerplexityProvider] HTTP ${res.status}: ${err}`);
    }

    const data = await res.json() as any;
    const choice = data.choices?.[0];

    return {
      text:      choice?.message?.content ?? '',
      model,
      provider:  this.id,
      tokensIn:  data.usage?.prompt_tokens    ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      await this.call('sonar', 'ping', { maxTokens: 8 });
      return true;
    } catch {
      return false;
    }
  }
}
