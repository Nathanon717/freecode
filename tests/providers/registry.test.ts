import { describe, it, expect } from 'vitest';
import { PROVIDER_REGISTRY, getProvider, initDynamicProviders, resolveModel, clearModelNewFlag, invalidateDeadModel } from '../../src/providers/registry.js';

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
      expect(providerIds).toContain('zen');
      expect(providerIds).toContain('huggingface');
    });

    it('should have 15 providers total', () => {
      expect(PROVIDER_REGISTRY).toHaveLength(15);
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
      expect(types.filter(t => t === 'openai-compat')).toHaveLength(14);
      expect(types.filter(t => t === 'anthropic')).toHaveLength(1);
    });

  });

  describe('fake LLM guard', () => {
    it('hides mock models unless fake mode is active', () => {
      const previous = process.env.FREECODE_FAKE_LLM;
      delete process.env.FREECODE_FAKE_LLM;
      try {
        expect(() => resolveModel('mock:gpt-freecode-test')).toThrow('only available when FREECODE_FAKE_LLM=1');
      } finally {
        if (previous === undefined) delete process.env.FREECODE_FAKE_LLM;
        else process.env.FREECODE_FAKE_LLM = previous;
      }
    });

    it('hides mock-native models unless fake mode is active', () => {
      const previous = process.env.FREECODE_FAKE_LLM;
      delete process.env.FREECODE_FAKE_LLM;
      try {
        expect(() => resolveModel('mock-native:gpt-freecode-test')).toThrow('only available when FREECODE_FAKE_LLM=1');
      } finally {
        if (previous === undefined) delete process.env.FREECODE_FAKE_LLM;
        else process.env.FREECODE_FAKE_LLM = previous;
      }
    });

    it('resolves mock-native models in fake mode with native provider id', () => {
      const previous = process.env.FREECODE_FAKE_LLM;
      process.env.FREECODE_FAKE_LLM = '1';
      try {
        const resolved = resolveModel('mock-native:gpt-freecode-test');
        expect(resolved.providerId).toBe('mock-native');
        expect(resolved.modelId).toBe('gpt-freecode-test');
      } finally {
        if (previous === undefined) delete process.env.FREECODE_FAKE_LLM;
        else process.env.FREECODE_FAKE_LLM = previous;
      }
    });

    it('blocks real provider resolution in fake mode before reading keys', () => {
      const previous = process.env.FREECODE_FAKE_LLM;
      process.env.FREECODE_FAKE_LLM = '1';
      try {
        expect(() => resolveModel('openai:gpt-5.1')).toThrow('Real provider access is blocked');
      } finally {
        if (previous === undefined) delete process.env.FREECODE_FAKE_LLM;
        else process.env.FREECODE_FAKE_LLM = previous;
      }
    });

    it('blocks live model discovery in fake mode', async () => {
      const previous = process.env.FREECODE_FAKE_LLM;
      process.env.FREECODE_FAKE_LLM = '1';
      try {
        await expect(initDynamicProviders()).rejects.toThrow('Live model discovery is blocked');
      } finally {
        if (previous === undefined) delete process.env.FREECODE_FAKE_LLM;
        else process.env.FREECODE_FAKE_LLM = previous;
      }
    });
  });

  describe('clearModelNewFlag', () => {
    it('removes isNew flag from a model', () => {
      const provider = PROVIDER_REGISTRY.find(p => p.modelsSource !== 'live' && p.models.length > 0)!;
      const model = provider.models[0];
      (model as Record<string, unknown>).isNew = true;
      try {
        clearModelNewFlag(provider.id, model.id);
        expect(model.isNew).toBeUndefined();
      } finally {
        delete (model as Record<string, unknown>).isNew;
      }
    });

    it('is a no-op for an unknown provider', () => {
      expect(() => clearModelNewFlag('no-such-provider', 'any-model')).not.toThrow();
    });

    it('is a no-op when model has no isNew flag', () => {
      const provider = PROVIDER_REGISTRY.find(p => p.modelsSource !== 'live' && p.models.length > 0)!;
      const model = provider.models[0];
      delete (model as Record<string, unknown>).isNew;
      expect(() => clearModelNewFlag(provider.id, model.id)).not.toThrow();
      expect(model.isNew).toBeUndefined();
    });
  });

  describe('invalidateDeadModel', () => {
    it('removes a model from the provider model list', () => {
      const provider = PROVIDER_REGISTRY.find(p => p.modelsSource !== 'live' && p.models.length > 0)!;
      const savedModels = [...provider.models];
      const targetId = provider.models[0].id;
      try {
        invalidateDeadModel(provider.id, targetId);
        expect(provider.models.find(m => m.id === targetId)).toBeUndefined();
      } finally {
        provider.models = savedModels;
      }
    });

    it('is a no-op for an unknown provider', () => {
      expect(() => invalidateDeadModel('no-such-provider', 'any-model')).not.toThrow();
    });
  });

  describe('resolveModel', () => {
    it('throws when model preference is empty', () => {
      expect(() => resolveModel('')).toThrow('No model selected');
    });

    it('throws for an unknown provider in real mode', () => {
      const prev = process.env.FREECODE_FAKE_LLM;
      delete process.env.FREECODE_FAKE_LLM;
      try {
        expect(() => resolveModel('no-such-provider:some-model')).toThrow('Unknown provider');
      } finally {
        if (prev === undefined) delete process.env.FREECODE_FAKE_LLM;
        else process.env.FREECODE_FAKE_LLM = prev;
      }
    });

    it('throws when no API key is configured for the provider', () => {
      const prevFake = process.env.FREECODE_FAKE_LLM;
      const prevKey = process.env.GROQ_API_KEY;
      delete process.env.FREECODE_FAKE_LLM;
      delete process.env.GROQ_API_KEY;
      try {
        expect(() => resolveModel('groq:llama-3.3-70b-versatile')).toThrow('No API key configured');
      } finally {
        if (prevFake === undefined) delete process.env.FREECODE_FAKE_LLM;
        else process.env.FREECODE_FAKE_LLM = prevFake;
        if (prevKey === undefined) delete process.env.GROQ_API_KEY;
        else process.env.GROQ_API_KEY = prevKey;
      }
    });

    it('resolves an openai-compat model when API key is present', () => {
      const prevFake = process.env.FREECODE_FAKE_LLM;
      const prevKey = process.env.GROQ_API_KEY;
      delete process.env.FREECODE_FAKE_LLM;
      process.env.GROQ_API_KEY = 'test-key';
      try {
        const result = resolveModel('groq:llama-3.3-70b-versatile');
        expect(result.providerId).toBe('groq');
        expect(result.modelId).toBe('llama-3.3-70b-versatile');
        expect(result.supportsTools).toBe(true);
        expect(result.model).toBeDefined();
      } finally {
        if (prevFake === undefined) delete process.env.FREECODE_FAKE_LLM;
        else process.env.FREECODE_FAKE_LLM = prevFake;
        if (prevKey === undefined) delete process.env.GROQ_API_KEY;
        else process.env.GROQ_API_KEY = prevKey;
      }
    });

    it('resolves an anthropic model when API key is present', () => {
      const prevFake = process.env.FREECODE_FAKE_LLM;
      const prevKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.FREECODE_FAKE_LLM;
      process.env.ANTHROPIC_API_KEY = 'test-key';
      try {
        const result = resolveModel('anthropic:claude-sonnet-4-6');
        expect(result.providerId).toBe('anthropic');
        expect(result.modelId).toBe('claude-sonnet-4-6');
        expect(result.supportsTools).toBe(true);
        expect(result.model).toBeDefined();
      } finally {
        if (prevFake === undefined) delete process.env.FREECODE_FAKE_LLM;
        else process.env.FREECODE_FAKE_LLM = prevFake;
        if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = prevKey;
      }
    });
  });
});
