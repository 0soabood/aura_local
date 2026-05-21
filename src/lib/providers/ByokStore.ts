/**
 * BYOK (Bring Your Own Key) Store — manages user-provided API keys.
 *
 * Checks BYOK store first, falls back to process.env.
 * Keys are stored in memory and persisted to the settings table.
 * Keys are never exposed in GET responses (only masked previews).
 */

// ── Key store ──────────────────────────────────────────────────────────────────

const userKeys = new Map<string, string>();

/**
 * Set a user-provided API key for a provider.
 * Pass empty string to clear.
 */
export function setUserKey(providerId: string, apiKey: string): void {
  if (!apiKey.trim()) {
    userKeys.delete(providerId);
  } else {
    userKeys.set(providerId, apiKey.trim());
  }
}

/**
 * Get the raw API key for a provider.
 * Checks BYOK store first, falls back to process.env.
 */
export function resolveKey(providerId: string, envKey: string): string {
  return userKeys.get(providerId) ?? process.env[envKey] ?? '';
}

/**
 * Check if a provider has any key configured (BYOK or env).
 */
export function hasKey(providerId: string, envKey: string): boolean {
  return !!resolveKey(providerId, envKey);
}

/**
 * Returns true if a provider's key came from BYOK (not env).
 */
export function isUserKey(providerId: string, envKey: string): boolean {
  return userKeys.has(providerId) && !!userKeys.get(providerId);
}

/**
 * Get masked preview of a key for UI display.
 * Shows first 6 chars + "..." if BYOK key exists.
 */
export function getMaskedPreview(providerId: string, envKey: string): string | null {
  const key = userKeys.get(providerId) ?? process.env[envKey];
  if (!key) return null;
  if (key.length <= 12) return key.slice(0, 4) + '...';
  return key.slice(0, 6) + '...' + key.slice(-4);
}

/**
 * Get status of all providers (BYOK configured, env configured, or none).
 */
export function getAllProviderStatus(): Record<string, {
  hasEnvKey: boolean;
  hasUserKey: boolean;
  maskedPreview: string | null;
  source: 'env' | 'user' | 'none';
}> {
  const result: Record<string, any> = {};
  for (const [providerId, _] of userKeys) {
    result[providerId] = {
      hasEnvKey: false, // caller should fill this in
      hasUserKey: true,
      maskedPreview: getMaskedPreview(providerId, ''),
      source: 'user',
    };
  }
  return result;
}

/**
 * Serialize all BYOK keys for persistence (settings table).
 * Keys are stored as-is (they're the user's own keys).
 */
export function serialize(): Record<string, string> {
  return Object.fromEntries(userKeys);
}

/**
 * Restore BYOK keys from persistence.
 */
export function deserialize(data: Record<string, string>): void {
  for (const [id, key] of Object.entries(data)) {
    if (key) userKeys.set(id, key);
  }
}
