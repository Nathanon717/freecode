import { describe, it, expect } from 'vitest';
import { PROVIDER_REGISTRY } from '../../src/providers/registry-data.js';

describe('PROVIDER_REGISTRY data', () => {
  it('contains both openai-compat and anthropic types', () => {
    const types = new Set(PROVIDER_REGISTRY.map(p => p.type));
    expect(types.has('openai-compat')).toBe(true);
    expect(types.has('anthropic')).toBe(true);
  });

  it('all openai-compat entries have a baseUrl', () => {
    for (const p of PROVIDER_REGISTRY) {
      if (p.type === 'openai-compat') {
        expect(typeof p.baseUrl).toBe('string');
        expect(p.baseUrl!.length).toBeGreaterThan(0);
      }
    }
  });

  it('all entries have unique ids', () => {
    const ids = PROVIDER_REGISTRY.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all entries have a non-empty apiKeyEnvVar', () => {
    for (const p of PROVIDER_REGISTRY) {
      expect(typeof p.apiKeyEnvVar).toBe('string');
      expect(p.apiKeyEnvVar.length).toBeGreaterThan(0);
    }
  });

  it('static-model providers have at least one model', () => {
    for (const p of PROVIDER_REGISTRY.filter(p => p.modelsSource !== 'live')) {
      expect(p.models.length).toBeGreaterThan(0);
    }
  });
});
