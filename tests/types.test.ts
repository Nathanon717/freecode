import { describe, it, expect } from 'vitest';
import * as types from '../src/providers/types.js';

describe('Provider Types', () => {
  describe('ModelConfig', () => {
    it('should have correct structure', () => {
      const model: types.ModelConfig = {
        id: 'test-model',
        displayName: 'Test Model',
        contextWindow: 128000,
      };

      expect(model.id).toBe('test-model');
      expect(model.displayName).toBe('Test Model');
      expect(model.contextWindow).toBe(128000);
    });
  });

  describe('ProviderConfig', () => {
    it('should have correct structure', () => {
      const config: types.ProviderConfig = {
        id: 'groq',
        name: 'Groq',
        type: 'openai-compat',
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKeyEnvVar: 'GROQ_API_KEY',
        models: [],
      };

      expect(config.id).toBe('groq');
      expect(config.type).toBe('openai-compat');
    });
  });

  describe('Config', () => {
    it('should have correct structure', () => {
      const config: types.Config = {
        providers: {
          groq: { apiKey: 'test-key' },
        },
        preferredModel: 'groq:llama-3.1-8b-instant',
        useOllama: true,
        toolRationale: true,
      };

      expect(config.providers.groq?.apiKey).toBe('test-key');
      expect(config.preferredModel).toBe('groq:llama-3.1-8b-instant');
    });

    it('should allow empty providers', () => {
      const config: types.Config = {
        providers: {},
        useOllama: false,
        toolRationale: false,
      };

      expect(Object.keys(config.providers).length).toBe(0);
    });
  });
});
