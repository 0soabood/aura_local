/**
 * RegistrySingleton - Ensures a single ProviderRegistry instance across the app.
 *
 * ProviderRegistry holds rate-limit counters, model lists, and connection state.
 * Multiple instances mean independent state — defeating rate limiting and
 * duplicating API calls. This singleton ensures all consumers share one instance.
 *
 * Usage:
 *   import { getSharedRegistry } from '../lib/RegistrySingleton';
 *   const registry = getSharedRegistry();
 *
 * The first call creates the instance synchronously; async model fetching
 * (OpenRouter, Groq) runs in the background. All subsequent calls return the
 * same instance immediately.
 */
import { ProviderRegistry } from './providers/ProviderRegistry';

let instance: ProviderRegistry | null = null;

export function getSharedRegistry(): ProviderRegistry {
  if (!instance) {
    instance = new ProviderRegistry();
    // Fire-and-forget async initialization so model fetching happens
    // without blocking module-level initialization of agents and graph.
    if (typeof (instance as any).waitForInitialization === 'function') {
      (instance as any).waitForInitialization().catch((err: unknown) => {
        console.warn('[RegistrySingleton] Background init failed:', err);
      });
    }
  }
  return instance;
}

/**
 * Awaitable version for callers that need to guarantee init is done
 * before proceeding (e.g. API route handlers).
 */
export async function getSharedRegistryAsync(): Promise<ProviderRegistry> {
  const reg = getSharedRegistry();
  if (typeof (reg as any).waitForInitialization === 'function') {
    await (reg as any).waitForInitialization();
  }
  return reg;
}
