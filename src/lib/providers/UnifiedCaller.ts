/**
 * UnifiedCaller — single HTTP call function for all supported provider APIs.
 *
 * Two wire formats:
 *   OpenAI-compatible  — POST /chat/completions, Bearer auth,
 *                        body: { model, messages, temperature, max_tokens }
 *                        response: choices[0].message.content
 *
 *   Google AI Studio   — POST models/{model}:generateContent?key=...,
 *                        body: { contents: [{ parts: [{ text }] }] }
 *                        response: candidates[0].content.parts[0].text
 */

export interface CallerMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallerResult {
  text: string;
  model: string;
  providerId: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  rateLimited: boolean;
  retryAfterSeconds?: number;
  errorMessage?: string;
  toolCalls?: any[];
}

export type ProviderFormat = 'openai' | 'google';

export interface CallerOptions {
  temperature?: number;
  maxTokens?: number;
  format: ProviderFormat;
  baseUrl: string;
  apiKey: string;
  providerId: string;
  tools?: any[];
}

export async function callProvider(
  model: string,
  messages: CallerMessage[],
  opts: CallerOptions,
): Promise<CallerResult> {
  const start = Date.now();

  if (opts.format === 'google') {
    return callGoogle(model, messages, opts, start);
  }
  return callOpenAI(model, messages, opts, start);
}

// ── OpenAI-compatible ──────────────────────────────────────────────────────

async function callOpenAI(
  model: string,
  messages: CallerMessage[],
  opts: CallerOptions,
  start: number,
): Promise<CallerResult> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${opts.apiKey}`,
    'Content-Type': 'application/json',
  };

  // OpenRouter requires attribution headers per their ToS.
  if (opts.providerId === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/aura-local-sync';
    headers['X-Title'] = 'AURA Local Sync';
  }

  const hasTools = Array.isArray(opts.tools) && opts.tools.length > 0;

  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(hasTools ? { tools: opts.tools, tool_choice: 'auto' } : {}),
    }),
  });

  const latencyMs = Date.now() - start;

  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after');
    const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
    const validRetry = retrySeconds !== undefined && !isNaN(retrySeconds) ? retrySeconds : undefined;
    return {
      text: '', model, providerId: opts.providerId,
      tokensIn: 0, tokensOut: 0, latencyMs,
      rateLimited: true,
      retryAfterSeconds: validRetry,
      errorMessage: validRetry
        ? `${opts.providerId} rate limited — retry after ${validRetry}s`
        : `${opts.providerId} rate limited`,
    };
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[${opts.providerId}] HTTP ${res.status}: ${body}`);
  }

  const data = await res.json() as any;
  const choice = data.choices?.[0];
  const text: string = choice?.message?.content ?? '';
  const toolCalls = choice?.message?.tool_calls;

  return {
    text, model, providerId: opts.providerId,
    tokensIn:  data.usage?.prompt_tokens    ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
    latencyMs,
    rateLimited: false,
    ...(toolCalls?.length ? { toolCalls } : {}),
  };
}

// ── Google AI Studio ───────────────────────────────────────────────────────

async function callGoogle(
  model: string,
  messages: CallerMessage[],
  opts: CallerOptions,
  start: number,
): Promise<CallerResult> {
  // Flatten messages into a single prompt string; Google AI Studio's
  // generateContent supports multi-turn but the simple contents array is
  // sufficient for our single-shot synthesis and research use cases.
  const systemMsg = messages.find(m => m.role === 'system')?.content;
  const userMsgs  = messages.filter(m => m.role !== 'system');

  const parts = userMsgs.map(m => ({ text: m.content }));
  if (systemMsg) parts.unshift({ text: `${systemMsg}\n\n` });

  const url = `${opts.baseUrl}/models/${model}:generateContent?key=${opts.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
      },
    }),
  });

  const latencyMs = Date.now() - start;

  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after');
    const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
    const validRetry = retrySeconds !== undefined && !isNaN(retrySeconds) ? retrySeconds : undefined;
    return {
      text: '', model, providerId: opts.providerId,
      tokensIn: 0, tokensOut: 0, latencyMs,
      rateLimited: true,
      retryAfterSeconds: validRetry,
      errorMessage: validRetry
        ? `google rate limited — retry after ${validRetry}s`
        : 'google rate limited',
    };
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[google] HTTP ${res.status}: ${body}`);
  }

  const data = await res.json() as any;
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const usage = data.usageMetadata;

  return {
    text, model, providerId: opts.providerId,
    tokensIn:  usage?.promptTokenCount     ?? 0,
    tokensOut: usage?.candidatesTokenCount ?? 0,
    latencyMs,
    rateLimited: false,
  };
}
