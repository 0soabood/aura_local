"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroqProvider = void 0;
const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
/**
 * Groq provider — OpenAI-compatible API, no extra SDK needed.
 *
 * Recommended models:
 *   General / planning : groq:llama-3.3-70b-versatile
 *   Code               : groq:qwen-2.5-coder-32b
 *   Fast / cheap       : groq:llama-3.1-8b-instant
 */
class GroqProvider {
    constructor() {
        this.id = 'groq';
        this.supportedModels = [
            'llama-3.1-8b-instant',
            'llama-3.3-70b-versatile',
            'compound-beta', // search-augmented, secondary
            'compound-beta-mini',
            'llama-3.1-8b-instant',
            'mixtral-8x7b-32768',
        ];
    }
    getApiKey() {
        return process.env.GROQ_API_KEY ?? '';
    }
    async call(model, prompt, opts = {}) {
        const apiKey = this.getApiKey();
        if (!apiKey)
            throw new Error('[GroqProvider] GROQ_API_KEY not set');
        const start = Date.now();
        const messages = [];
        if (opts.systemPrompt) {
            messages.push({ role: 'system', content: opts.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });
        const hasTools = Array.isArray(opts.tools) && opts.tools.length > 0;
        const body = {
            model,
            messages,
            temperature: opts.temperature ?? 0.2,
            ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
            // response_format:json_object and tools are mutually exclusive on Groq — never send both.
            ...(!hasTools && opts.responseFormat === 'json'
                ? { response_format: { type: 'json_object' } }
                : {}),
            // Tools are already in strict OpenAI format: { type:'function', function:{name,description,parameters} }.
            // Groq handles tool dispatch natively; no XML or custom syntax needed in prompts.
            ...(hasTools ? { tools: opts.tools, tool_choice: 'auto' } : {}),
        };
        const res = await fetch(`${GROQ_API_BASE}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        // Normalise 429 to rateLimited result so callers can chain to the next
        // provider without catching a thrown error.
        if (res.status === 429) {
            const retryAfter = res.headers.get('retry-after');
            const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
            const validRetry = retrySeconds !== undefined && !isNaN(retrySeconds) ? retrySeconds : undefined;
            const body429 = await res.text();
            return {
                text: '',
                model,
                provider: this.id,
                tokensIn: 0,
                tokensOut: 0,
                latencyMs: Date.now() - start,
                rateLimited: true,
                retryAfterSeconds: validRetry,
                errorMessage: validRetry
                    ? `Groq rate limit exceeded. Retry after ${validRetry}s.`
                    : `Groq rate limit exceeded. ${body429}`.trim(),
            };
        }
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`[GroqProvider] HTTP ${res.status}: ${err}`);
        }
        const data = await res.json();
        const choice = data.choices?.[0];
        // When the model responds with tool_calls, content is null — normalise to ''.
        const text = choice?.message?.content ?? '';
        const toolCalls = Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length > 0
            ? choice.message.tool_calls
            : undefined;
        return {
            text,
            model,
            provider: this.id,
            tokensIn: data.usage?.prompt_tokens ?? 0,
            tokensOut: data.usage?.completion_tokens ?? 0,
            latencyMs: Date.now() - start,
            ...(toolCalls ? { toolCalls } : {}),
        };
    }
    async isAvailable() {
        if (!this.getApiKey())
            return false;
        try {
            const result = await this.call('llama-3.1-8b-instant', 'ping', { maxTokens: 8 });
            return !result.rateLimited;
        }
        catch {
            return false;
        }
    }
}
exports.GroqProvider = GroqProvider;
