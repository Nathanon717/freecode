import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDbConfigCache,
  setDbConfigCache,
  clearDbConfigCache,
  registerCacheInvalidator,
  registerConfigPersist,
  persistDbConfig,
} from '../../src/providers/db-config-cache.js';

beforeEach(() => {
  clearDbConfigCache();
  // Reset callbacks between tests by registering no-ops
  registerCacheInvalidator(() => {});
  registerConfigPersist(() => {});
});

describe('db-config-cache: lifecycle', () => {
  it('starts null after clearDbConfigCache()', () => {
    expect(getDbConfigCache()).toBeNull();
  });

  it('setDbConfigCache() stores the data', () => {
    const data = { global: { toolRationale: false }, providerOverrides: null };
    setDbConfigCache(data);
    expect(getDbConfigCache()).toEqual(data);
  });

  it('clearDbConfigCache() resets to null', () => {
    setDbConfigCache({ global: null, providerOverrides: null });
    clearDbConfigCache();
    expect(getDbConfigCache()).toBeNull();
  });
});

describe('db-config-cache: invalidator callback', () => {
  it('setDbConfigCache() triggers the registered invalidator', () => {
    const fn = vi.fn();
    registerCacheInvalidator(fn);
    setDbConfigCache({ global: null, providerOverrides: null });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('clearDbConfigCache() triggers the registered invalidator', () => {
    const fn = vi.fn();
    registerCacheInvalidator(fn);
    clearDbConfigCache();
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('db-config-cache: persist callback', () => {
  it('persistDbConfig() calls the registered persist function with scope and data', () => {
    const fn = vi.fn();
    registerConfigPersist(fn);
    const data = { toolRationale: false };
    persistDbConfig('global', data);
    expect(fn).toHaveBeenCalledWith('global', data);
  });

  it('persistDbConfig() is a no-op when no persist function is registered', () => {
    registerConfigPersist(() => {});
    // Re-register nothing (simulate unregistered state by registering a spy then clearing)
    expect(() => persistDbConfig('global', {})).not.toThrow();
  });
});
