import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from './ProviderRegistry';

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;
  const OPENROUTER_KEY = 'OPENROUTER_API_KEY';
  const originalEnv = { ...process.env };

  beforeEach(() => {
    registry = new ProviderRegistry();
    // Clear all provider env vars so tests are deterministic
    ['GROQ_API_KEY', 'GOOGLE_AI_STUDIO_API_KEY', 'OPENROUTER_API_KEY',
     'MISTRAL_API_KEY', 'COHERE_API_KEY', 'DEEPSEEK_API_KEY'].forEach(k => delete process.env[k]);
  });

  afterEach(() => {
    Object.assign(process.env, originalEnv);
  });

  describe('listProviders()', () => {
    it('returns OpenRouter as the only built-in provider', () => {
      const ids = registry.listProviders();
      expect(ids).toContain('openrouter');
      expect(ids).toHaveLength(1);
    });
  });

  describe('getAvailableProviders()', () => {
    it('returns only providers with API keys set', () => {
      process.env[OPENROUTER_KEY] = 'test-key';
      const available = registry.getAvailableProviders();
      expect(available.length).toBe(1);
      expect(available[0].id).toBe('openrouter');
    });

    it('returns empty array when no API keys are configured', () => {
      expect(registry.getAvailableProviders()).toHaveLength(0);
    });

    it('places preferred provider first when available', () => {
      process.env[OPENROUTER_KEY] = 'test-key';
      const available = registry.getAvailableProviders('openrouter');
      expect(available[0].id).toBe('openrouter');
    });
  });

  describe('healthCheck()', () => {
    it('reports true only for providers with API keys configured', async () => {
      process.env[OPENROUTER_KEY] = 'test-key';
      const health = await registry.healthCheck();
      expect(health['openrouter']).toBe(true);
    });

    it('reports false for all when no keys are set', async () => {
      const health = await registry.healthCheck();
      for (const val of Object.values(health)) {
        expect(val).toBe(false);
      }
    });
  });
});
