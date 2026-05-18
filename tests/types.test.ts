import { describe, it, expect } from 'vitest';
import * as types from '../src/providers/types.js';

describe('Provider Types', () => {
  describe('ModelConfig', () => {
    it('should have correct structure', () => {
      const model: types.ModelConfig = {
        id: 'test-model',
        displayName: 'Test Model',
        contextWindow: 128000,
        isLocal: true,
      };

      expect(model.id).toBe('test-model');
      expect(model.displayName).toBe('Test Model');
      expect(model.contextWindow).toBe(128000);
      expect(model.isLocal).toBe(true);
    });

    it('should allow optional isLocal field', () => {
      const model: types.ModelConfig = {
        id: 'test-model',
        displayName: 'Test Model',
        contextWindow: 32000,
      };

      expect(model.isLocal).toBeUndefined();
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

  describe('RouteOptions', () => {
    it('should have optional fields', () => {
      const options: types.RouteOptions = {};

      expect(options.preferLocal).toBeUndefined();
    });

    it('should accept all options', () => {
      const options: types.RouteOptions = {
        preferLocal: true,
      };

      expect(options.preferLocal).toBe(true);
    });
  });

  describe('Config', () => {
    it('should have correct structure', () => {
      const config: types.Config = {
        providers: {
          groq: { apiKey: 'test-key' },
        },
        preferLocal: true,
        preferSpeed: true,
      };

      expect(config.providers.groq?.apiKey).toBe('test-key');
      expect(config.preferLocal).toBe(true);
      expect(config.preferSpeed).toBe(true);
    });

    it('should allow empty providers', () => {
      const config: types.Config = {
        providers: {},
        preferLocal: false,
        preferSpeed: false,
      };

      expect(Object.keys(config.providers).length).toBe(0);
    });
  });
});
