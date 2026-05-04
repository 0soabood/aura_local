import path from 'path';

/**
 * UnifiedCaller — single HTTP call function for all supported provider APIs.
 *
 * Three wire formats:
 *   openai   — POST /chat/completions, Bearer auth (Groq, Mistral, Cohere,
 *              DeepSeek, OpenRouter all speak this dialect)
 *   google   — POST models/{model}:generateContent?key=... (AI Studio)
 *   vertex   — Google Vertex AI via @google/genai SDK using ADC / service
 *              account (GOOGLE_APPLICATION_CREDENTIALS + GOOGLE_CLOUD_PROJECT)
 */

export interface CallerMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  /** Present on tool-result messages (role === 'tool'). */
  tool_call_id?: string;
  /** Present on assistant messages that contain tool calls. */
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
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

export type ProviderFormat = 'openai' | 'google' | 'vertex';

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

  if (opts.format === 'vertex') return callVertex(model, messages, opts, start);
  if (opts.format === 'google')  return callGoogle(model, messages, opts, start);
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

  if (res.status === 429 || res.status === 413) {
    const retryAfter = res.headers.get('retry-after');
    const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
    const validRetry = retrySeconds !== undefined && !isNaN(retrySeconds) ? retrySeconds : undefined;
    const limitKind = res.status === 413 ? 'token limit exceeded' : 'rate limited';
    return {
      text: '', model, providerId: opts.providerId,
      tokensIn: 0, tokensOut: 0, latencyMs,
      rateLimited: true,
      retryAfterSeconds: validRetry,
      errorMessage: validRetry
        ? `${opts.providerId} ${limitKind} — retry after ${validRetry}s`
        : `${opts.providerId} ${limitKind}`,
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

// ── Google Vertex AI (via @google/genai SDK + ADC) ─────────────────────────

async function callVertex(
  model: string,
  messages: CallerMessage[],
  opts: CallerOptions,
  start: number,
): Promise<CallerResult> {
  // opts.apiKey carries GOOGLE_CLOUD_PROJECT; location comes from env.
  const project  = opts.apiKey;
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'europe-west3';

  // Dynamic import keeps the SDK out of the bundle for providers that don't use it.
  const { GoogleGenAI } = await import('@google/genai');
  
  // Resolve credentials path if provided
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const resolvedCredPath = credPath && !path.isAbsolute(credPath) 
    ? path.resolve(process.cwd(), credPath) 
    : credPath;
  
  const ai = resolvedCredPath
    ? new GoogleGenAI({ 
        vertexai: true, 
        project, 
        location,
        googleAuthOptions: {
          keyFile: resolvedCredPath
        }
      } as any)
    : new GoogleGenAI({ vertexai: true, project, location } as any);

  // Split system instructions from the conversation.
  const systemMsg = messages.find(m => m.role === 'system')?.content ?? undefined;
  const convMsgs  = messages.filter(m => m.role !== 'system');

  // Build Google-format contents array.
  const contents: any[] = convMsgs.map(m => {
    if (m.role === 'tool') {
      // Tool result: find the matching tool name from prior assistant message.
      return {
        role: 'tool',
        parts: [{ functionResponse: {
          name: m.tool_call_id ?? 'tool',
          response: { result: m.content ?? '' },
        } }],
      };
    }
    if (m.role === 'assistant' && m.tool_calls?.length) {
      // Assistant tool-call request.
      return {
        role: 'model',
        parts: m.tool_calls.map(tc => ({
          functionCall: {
            name: tc.function.name,
            args: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
          },
        })),
      };
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content ?? '' }],
    };
  });

  // Convert OpenAI tool definitions to Google function declarations.
  const googleTools = opts.tools?.length
    ? [{ functionDeclarations: opts.tools.map((t: any) => t.function ?? t) }]
    : undefined;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: contents.length === 1 ? (contents[0].parts?.[0]?.text ?? contents) : contents,
      config: {
        ...(systemMsg ? { systemInstruction: systemMsg } : {}),
        temperature: opts.temperature ?? 0.2,
        ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
        ...(googleTools ? { tools: googleTools } : {}),
      },
    });

    return {
      text:      response.text ?? '',
      model,
      providerId: opts.providerId,
      tokensIn:   response.usageMetadata?.promptTokenCount    ?? 0,
      tokensOut:  response.usageMetadata?.candidatesTokenCount ?? 0,
      latencyMs:  Date.now() - start,
      rateLimited: false,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const is429 = err?.status === 429 || err?.code === 429 ||
      (typeof err?.message === 'string' && err.message.includes('RESOURCE_EXHAUSTED'));
    const is413 = err?.status === 413 || err?.code === 413 ||
      (typeof err?.message === 'string' && err.message.includes('Request payload size exceeds'));

    if (is429 || is413) {
      return {
        text: '', model, providerId: opts.providerId,
        tokensIn: 0, tokensOut: 0, latencyMs,
        rateLimited: true,
        errorMessage: `vertex ${is413 ? 'token limit exceeded' : 'rate limited'}`,
      };
    }
    throw err;
  }
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

  if (res.status === 429 || res.status === 413) {
    const retryAfter = res.headers.get('retry-after');
    const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
    const validRetry = retrySeconds !== undefined && !isNaN(retrySeconds) ? retrySeconds : undefined;
    const limitKind = res.status === 413 ? 'token limit exceeded' : 'rate limited';
    return {
      text: '', model, providerId: opts.providerId,
      tokensIn: 0, tokensOut: 0, latencyMs,
      rateLimited: true,
      retryAfterSeconds: validRetry,
      errorMessage: validRetry
        ? `google ${limitKind} — retry after ${validRetry}s`
        : `google ${limitKind}`,
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
