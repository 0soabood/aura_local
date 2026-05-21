// ModelConfig.ts - Browser-compatible model configuration
// Note: quotaTracker is exported from a separate file (ModelConfig.server.ts)
// to avoid pulling better-sqlite3 into browser bundles
//
// Updated: Groq added as primary/fallback for ultra-fast inference

export const MODEL_ROLES = {
  daily_driver: {
    primary: 'groq:llama-3.3-70b-versatile',
    fallbacks: ['groq:llama-3.1-8b-instant', 'openrouter:meta-llama/llama-3.3-70b-instruct:free', 'openrouter:mistralai/mistral-7b-instruct:free'],
    maxTokens: 8000,
    contextWindow: 131072,
  },
  long_context: {
    primary: 'groq:llama-3.3-70b-versatile',
    fallbacks: ['groq:llama-3.1-8b-instant', 'openrouter:meta-llama/llama-3.3-70b-instruct:free'],
    maxTokens: 8000,
    contextWindow: 131072,
  },
  reasoning: {
    primary: 'groq:llama-3.3-70b-versatile',
    fallbacks: ['groq:qwen/qwen3-32b', 'openrouter:meta-llama/llama-3.3-70b-instruct:free'],
    maxTokens: 8000,
    contextWindow: 131072,
    dailyQuota: 50,
  },
  agent_orchestrator: {
    primary: 'groq:llama-3.3-70b-versatile',
    fallbacks: ['groq:llama-3.1-8b-instant', 'openrouter:meta-llama/llama-3.3-70b-instruct:free', 'openrouter:mistralai/mistral-7b-instruct:free'],
    maxTokens: 8000,
    contextWindow: 131072,
  },
  vision: {
    primary: 'openrouter:meta-llama/llama-3.3-70b-instruct:free',
    fallbacks: ['openrouter:mistralai/mistral-7b-instruct:free', 'groq:llama-3.3-70b-versatile'],
    maxTokens: 8000,
    contextWindow: 131072,
    dailyQuota: 50,
  },
  translate: {
    primary: 'groq:llama-3.1-8b-instant',
    fallbacks: ['groq:qwen/qwen3-32b', 'openrouter:meta-llama/llama-3.3-70b-instruct:free'],
    maxTokens: 8000,
    contextWindow: 131072,
    dailyQuota: 50,
  },
  compaction: {
    primary: 'groq:llama-3.1-8b-instant',
    fallbacks: ['groq:qwen/qwen3-32b', 'openrouter:mistralai/mistral-7b-instruct:free'],
    maxTokens: 4000,
    contextWindow: 131072,
  },
  bulk_fast: {
    primary: 'groq:llama-3.1-8b-instant',
    fallbacks: ['groq:qwen/qwen3-32b', 'openrouter:mistralai/mistral-7b-instruct:free'],
    maxTokens: 8000,
    contextWindow: 131072,
  },
  experimental: {
    primary: 'groq:qwen/qwen3-32b',
    fallbacks: ['groq:llama-3.1-8b-instant', 'openrouter:google/gemma-3-12b-it:free'],
    maxTokens: 8000,
    contextWindow: 131072,
  },
} as const;

export type ModelRole = keyof typeof MODEL_ROLES;

export const TRUNCATION_LIMITS: Record<ModelRole, number> = {
  daily_driver: 500000,
  long_context: 1000000,
  reasoning: 100000,
  agent_orchestrator: 200000,
  vision: 100000,
  translate: 8000,
  compaction: 500000,
  bulk_fast: 500000,
  experimental: 100000,
};

/** Returns the primary model for a role WITHOUT recording quota. Use for prompts. */
export function peekModel(role: ModelRole): string {
  return MODEL_ROLES[role].primary;
}

/** Returns the full fallback chain WITHOUT recording quota. Use for prompts. */
export function peekFallbackChain(role: ModelRole): string[] {
  const cfg = MODEL_ROLES[role];
  return [cfg.primary, ...cfg.fallbacks];
}

/** Resolves a model for execution, respecting daily quotas and recording usage. */
// resolveModel() is in ModelConfig.server.ts (requires quotaTracker/better-sqlite3)
// Exporting a placeholder for browser compatibility
export function resolveModel(role: ModelRole): string {
  console.warn('resolveModel() is only available in Node.js environment');
  return MODEL_ROLES[role].primary;
}

/** Returns the ordered fallback chain for execution. */
export function getFallbackChain(role: ModelRole): string[] {
  const cfg = MODEL_ROLES[role];
  return [cfg.primary, ...cfg.fallbacks];
}

/** Truncates content to the safe limit for a given role. */
export function truncatePayload(content: string, role: ModelRole): string {
  const limit = TRUNCATION_LIMITS[role] || 15000;
  if (content.length > limit) {
    return content.substring(0, limit) + `\n...[TRUNCATED: Payload too large. Reference local disk.]`;
  }
  return content;
}
