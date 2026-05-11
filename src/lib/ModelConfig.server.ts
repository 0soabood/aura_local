// ModelConfig.server.ts - Server-only model configuration
// This file imports quotaTracker which requires better-sqlite3 (Node.js only)

import { quotaTracker as qt } from './QuotaTracker';
import { MODEL_ROLES, ModelRole } from './ModelConfig';

// Re-export quotaTracker for server-side usage
export const quotaTracker = qt;

/** Resolves a model for execution, respecting daily quotas and recording usage. */
export function resolveModel(role: ModelRole): string {
  const cfg = MODEL_ROLES[role];
  if ('dailyQuota' in cfg && !quotaTracker.canUse(role, (cfg as any).dailyQuota)) {
    console.log(`[Quota] ${role} quota exhausted. Falling back to ${cfg.fallbacks[0]}`);
    return cfg.fallbacks[0] || cfg.primary;
  }
  quotaTracker.record(role);
  return cfg.primary;
}

// Helper that checks quota before returning a model
export function getModelWithQuotaCheck(role: ModelRole): string | null {
  const config = MODEL_ROLES[role];
  if ('dailyQuota' in config && !quotaTracker.canUse(role, (config as any).dailyQuota)) {
    return null; // Quota exceeded
  }
  return config.primary;
}
