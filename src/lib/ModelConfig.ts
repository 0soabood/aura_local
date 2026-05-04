// ModelConfig.ts - Browser-compatible model configuration
// Note: quotaTracker is exported from a separate file (ModelConfig.server.ts)
// to avoid pulling better-sqlite3 into browser bundles

export const MODEL_ROLES = {
  daily_driver: {
    primary: 'google:gemini-2.5-flash',
    fallbacks: ['vertex:gemini-2.5-flash', 'openrouter:google/gemini-2.5-flash'],
    maxTokens: 64000,
    contextWindow: 1000000,
  },
  long_context: {
    primary: 'vertex:gemini-2.5-pro',
    fallbacks: ['google:gemini-2.5-pro', 'openrouter:google/gemini-2.5-pro'],
    maxTokens: 64000,
    contextWindow: 2000000,
  },
  reasoning: {
    primary: 'cohere:command-a-reasoning',
    fallbacks: ['openrouter:cohere/command-a-reasoning', 'vertex:gemini-2.5-pro'],
    maxTokens: 32000,
    contextWindow: 256000,
    dailyQuota: 10,
  },
  agent_orchestrator: {
    primary: 'cohere:command-r-plus-08-2024',
    fallbacks: ['openrouter:cohere/command-a', 'vertex:gemini-2.5-pro'],
    maxTokens: 8000,
    contextWindow: 128000,
  },
  vision: {
    primary: 'cohere:command-a-vision',
    fallbacks: ['vertex:gemini-2.5-pro', 'openrouter:cohere/command-a-vision'],
    maxTokens: 8000,
    contextWindow: 128000,
    dailyQuota: 5,
  },
  translate: {
    primary: 'cohere:command-a-translate',
    fallbacks: ['vertex:gemini-2.5-flash', 'openrouter:cohere/command-a-translate'],
    maxTokens: 8000,
    contextWindow: 8000,
    dailyQuota: 5,
  },
  compaction: {
    primary: 'google:gemini-2.5-flash-lite',
    fallbacks: ['openrouter:google/gemma-3-27b-it', 'cohere:command-r7b'],
    maxTokens: 4000,
    contextWindow: 1000000,
  },
  bulk_fast: {
    primary: 'google:gemini-2.5-flash-lite',
    fallbacks: ['openrouter:google/gemini-2.5-flash-lite', 'openrouter:google/gemma-3-27b-it'],
    maxTokens: 64000,
    contextWindow: 1000000,
  },
  experimental: {
    primary: 'openrouter:deepseek/deepseek-chat',
    fallbacks: ['openrouter:qwen/qwen-2.5-72b-instruct', 'mistral:mistral-large'],
    maxTokens: 32000,
    contextWindow: 262000,
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