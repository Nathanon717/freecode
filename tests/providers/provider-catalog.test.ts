import { describe, it, expect } from 'vitest';
import { PROVIDER_REGISTRY } from '../../src/providers/provider-catalog.js';

describe('PROVIDER_REGISTRY data', () => {
  it('every entry has an id, name, and apiKeyEnvVar', () => {
    for (const p of PROVIDER_REGISTRY) {
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
      expect(typeof p.apiKeyEnvVar).toBe('string');
      expect(p.apiKeyEnvVar.length).toBeGreaterThan(0);
    }
  });

  it('anthropic has the expected baseUrl', () => {
    const anthropic = PROVIDER_REGISTRY.find(p => p.id === 'anthropic');
    expect(anthropic?.baseUrl).toBe('https://api.anthropic.com/v1');
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
