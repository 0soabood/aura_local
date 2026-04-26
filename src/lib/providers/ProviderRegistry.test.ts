import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from './ProviderRegistry';

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;
  const GROQ_KEY = 'GROQ_API_KEY';
  const MISTRAL_KEY = 'MISTRAL_API_KEY';
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
    it('returns all 6 built-in provider IDs', () => {
      const ids = registry.listProviders();
      expect(ids).toContain('groq');
      expect(ids).toContain('google');
      expect(ids).toContain('openrouter');
      expect(ids).toContain('mistral');
      expect(ids).toContain('cohere');
      expect(ids).toContain('deepseek');
    });
  });

  describe('getAvailableProviders()', () => {
    it('returns only providers with API keys set', () => {
      process.env[GROQ_KEY] = 'test-key';
      const available = registry.getAvailableProviders();
      expect(available.length).toBe(1);
      expect(available[0].id).toBe('groq');
    });

    it('returns multiple providers when multiple keys are set', () => {
      process.env[GROQ_KEY] = 'test-groq';
      process.env[MISTRAL_KEY] = 'test-mistral';
      const available = registry.getAvailableProviders();
      expect(available.length).toBe(2);
      expect(available.map(p => p.id)).toContain('groq');
      expect(available.map(p => p.id)).toContain('mistral');
    });

    it('returns empty array when no API keys are configured', () => {
      expect(registry.getAvailableProviders()).toHaveLength(0);
    });

    it('places preferred provider first when available', () => {
      process.env[GROQ_KEY] = 'test-groq';
      process.env[MISTRAL_KEY] = 'test-mistral';
      const available = registry.getAvailableProviders('mistral');
      expect(available[0].id).toBe('mistral');
    });
  });

  describe('healthCheck()', () => {
    it('reports true only for providers with API keys configured', async () => {
      process.env[GROQ_KEY] = 'test-key';
      const health = await registry.healthCheck();
      expect(health['groq']).toBe(true);
      expect(health['google']).toBe(false);
      expect(health['mistral']).toBe(false);
    });

    it('reports false for all when no keys are set', async () => {
      const health = await registry.healthCheck();
      for (const val of Object.values(health)) {
        expect(val).toBe(false);
      }
    });
  });
});
