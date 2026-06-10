import { describe, it, expect } from 'vitest';
import * as providersIndex from '../../src/providers/index.js';

describe('providers/index re-exports', () => {
  it('exports PROVIDER_REGISTRY from registry', () => {
    expect(Array.isArray(providersIndex.PROVIDER_REGISTRY)).toBe(true);
    expect(providersIndex.PROVIDER_REGISTRY.length).toBeGreaterThan(0);
  });

  it('exports getProvider from registry', () => {
    expect(typeof providersIndex.getProvider).toBe('function');
  });

  it('exports resolveModel from registry', () => {
    expect(typeof providersIndex.resolveModel).toBe('function');
  });
});
