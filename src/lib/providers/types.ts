/**
 * Provider abstraction layer — all model providers implement this interface.
 * Concrete adapters live alongside this file; the ProviderRegistry manages
 * instantiation, circuit-breaking, and fallback.
 */

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface CallOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** Hint to the provider about expected response shape */
  responseFormat?: 'text' | 'json' | 'code';
  /** OpenAI-compatible tool definitions to pass to the model */
  tools?: any[];
  /** Pre-built messages array. When provided, takes precedence over prompt + systemPrompt. */
  messages?: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  }>;
  /** Timeout in milliseconds for the LLM API call (default: 30000). */
  timeoutMs?: number;
}

export interface ProviderResult {
  text: string;
  model: string;
  provider: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  /** Populated when the model responds with tool calls instead of text */
  toolCalls?: ToolCall[];
  /** True when the provider rejected the call due to quota exhaustion (HTTP 429) */
  rateLimited?: boolean;
  /** Seconds to wait before retrying, extracted from the provider's Retry-Info header or error body */
  retryAfterSeconds?: number;
  /** Short human-readable description of the rate-limit error */
  errorMessage?: string;
}

export interface ModelProvider {
  /** Unique identifier used in "provider:model" routing strings */
  readonly id: string;
  readonly supportedModels: string[];

  call(model: string, prompt: string, opts?: CallOptions): Promise<ProviderResult>;

  /** Lightweight health probe used by the circuit breaker */
  isAvailable(): Promise<boolean>;
}
