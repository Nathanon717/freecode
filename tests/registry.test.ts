import { describe, it, expect } from 'vitest';
import { PROVIDER_REGISTRY, getProvider } from '../src/providers/registry.js';

describe('Provider Registry', () => {
  describe('PROVIDER_REGISTRY', () => {
    it('should have all expected providers', () => {
      const providerIds = PROVIDER_REGISTRY.map(p => p.id);

      expect(providerIds).toContain('groq');
      expect(providerIds).toContain('openrouter');
      expect(providerIds).toContain('siliconflow');
      expect(providerIds).toContain('nvidia');
      expect(providerIds).toContain('llm7');
      expect(providerIds).toContain('github');
      expect(providerIds).toContain('cohere');
      expect(providerIds).toContain('cerebras');
      expect(providerIds).toContain('mistral');
      expect(providerIds).toContain('anthropic');
      expect(providerIds).toContain('openai');
      expect(providerIds).toContain('cloudflare');
      expect(providerIds).toContain('zai');
    });

    it('should have 13 providers total', () => {
      expect(PROVIDER_REGISTRY).toHaveLength(13);
    });

    it('each provider should have required fields', () => {
      PROVIDER_REGISTRY.forEach(provider => {
        expect(provider.id).toBeDefined();
        expect(provider.name).toBeDefined();
        expect(provider.type).toBeDefined();
        expect(['openai-compat', 'anthropic']).toContain(provider.type);
        if (provider.type === 'openai-compat') {
          expect(provider.baseUrl).toBeDefined();
        }
        expect(provider.apiKeyEnvVar).toBeDefined();
        expect(provider.models).toBeDefined();
        expect(Array.isArray(provider.models)).toBe(true);
      });
    });

    it('static-model providers should have at least one model', () => {
      const staticProviders = PROVIDER_REGISTRY.filter(p => p.modelsSource !== 'live');
      staticProviders.forEach(provider => {
        expect(provider.models.length).toBeGreaterThan(0);
      });
    });

    it('each model should have required fields', () => {
      PROVIDER_REGISTRY.forEach(provider => {
        provider.models.forEach(model => {
          expect(model.id).toBeDefined();
          expect(model.displayName).toBeDefined();
        });
      });
    });
  });

  describe('getProvider', () => {
    it('should return provider by id', () => {
      const provider = getProvider('groq');

      expect(provider).toBeDefined();
      expect(provider?.id).toBe('groq');
      expect(provider?.name).toBe('Groq');
    });

    it('should return undefined for unknown provider', () => {
      const provider = getProvider('unknown-provider');

      expect(provider).toBeUndefined();
    });

    it('should return provider with correct baseUrl', () => {
      const provider = getProvider('openrouter');

      expect(provider?.baseUrl).toBe('https://openrouter.ai/api/v1');
    });

    it('should return provider with live model source', () => {
      const provider = getProvider('groq');

      expect(provider?.modelsSource).toBe('live');
      expect(provider?.models).toEqual([]);
    });
  });

  describe('Provider specific configurations', () => {
    it('Ollama should not be in registry (handled separately)', () => {
      const ollama = getProvider('ollama');
      expect(ollama).toBeUndefined();
    });

    it('paid providers should be marked correctly', () => {
      expect(getProvider('openai')?.paid).toBe(true);
      expect(getProvider('anthropic')?.paid).toBe(true);
      expect(getProvider('groq')?.paid).toBeFalsy();
    });

    it('provider types are correct', () => {
      const types = PROVIDER_REGISTRY.map(p => p.type);
      expect(types.filter(t => t === 'openai-compat')).toHaveLength(12);
      expect(types.filter(t => t === 'anthropic')).toHaveLength(1);
    });
  });
});
