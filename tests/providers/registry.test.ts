import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROVIDER_REGISTRY, getProvider, initDynamicProviders, resolveModel, clearModelNewFlag, invalidateDeadModel } from '../../src/providers/registry.js';

// Set the given env vars (undefined deletes), run fn, then restore originals.
// Collapses the save/try/finally/restore boilerplate that every env-sensitive test needs.
async function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const EXPECTED_PROVIDER_IDS = [
  'groq', 'openrouter', 'siliconflow', 'nvidia', 'llm7', 'github', 'cohere', 'cerebras',
  'mistral', 'anthropic', 'openai', 'cloudflare', 'zai', 'zen', 'huggingface',
];

describe('Provider Registry', () => {
  describe('PROVIDER_REGISTRY', () => {
    it('contains exactly the expected providers', () => {
      expect(PROVIDER_REGISTRY.map(p => p.id).sort()).toEqual([...EXPECTED_PROVIDER_IDS].sort());
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
    it('hides mock models unless fake mode is active', async () => {
      await withEnv({ FREECODE_FAKE_LLM: undefined }, () => {
        expect(() => resolveModel('mock:gpt-freecode-test')).toThrow('only available when FREECODE_FAKE_LLM=1');
      });
    });

    it('hides mock-native models unless fake mode is active', async () => {
      await withEnv({ FREECODE_FAKE_LLM: undefined }, () => {
        expect(() => resolveModel('mock-native:gpt-freecode-test')).toThrow('only available when FREECODE_FAKE_LLM=1');
      });
    });

    it('resolves mock-native models in fake mode with native provider id', async () => {
      await withEnv({ FREECODE_FAKE_LLM: '1' }, () => {
        const resolved = resolveModel('mock-native:gpt-freecode-test');
        expect(resolved.providerId).toBe('mock-native');
        expect(resolved.modelId).toBe('gpt-freecode-test');
      });
    });

    it('blocks real provider resolution in fake mode before reading keys', async () => {
      await withEnv({ FREECODE_FAKE_LLM: '1' }, () => {
        expect(() => resolveModel('openai:gpt-5.1')).toThrow('Real provider access is blocked');
      });
    });

    it('blocks live model discovery in fake mode', async () => {
      await withEnv({ FREECODE_FAKE_LLM: '1' }, async () => {
        await expect(initDynamicProviders()).rejects.toThrow('Live model discovery is blocked');
      });
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

    it('is a no-op when model id does not exist within a known provider', () => {
      const provider = PROVIDER_REGISTRY.find(p => p.modelsSource !== 'live' && p.models.length > 0)!;
      expect(() => clearModelNewFlag(provider.id, 'absolutely-nonexistent-model-xyz')).not.toThrow();
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

  describe('resolveModel supportsTools flag', () => {
    it('defaults supportsTools to true for providers that do not disable it', async () => {
      await withEnv({ FREECODE_FAKE_LLM: undefined, GROQ_API_KEY: 'test-key' }, () => {
        expect(resolveModel('groq:llama-3.3-70b-versatile').supportsTools).toBe(true);
      });
    });
  });

  describe('resolveModel', () => {
    it('throws when model preference is empty', () => {
      expect(() => resolveModel('')).toThrow('No model selected');
    });

    it('throws when model preference has no colon separator', async () => {
      await withEnv({ FREECODE_FAKE_LLM: undefined }, () => {
        expect(() => resolveModel('no-colon-string')).toThrow('Invalid model format');
      });
    });

    it('resolves mock: prefix in fake mode', async () => {
      await withEnv({ FREECODE_FAKE_LLM: '1' }, () => {
        const result = resolveModel('mock:test-model-id');
        expect(result.providerId).toBe('mock');
        expect(result.modelId).toBe('test-model-id');
        expect(result.supportsTools).toBe(true);
        expect(result.model).toBeDefined();
      });
    });

    it('supportsTools is false when modelId contains no-tools in fake mode', async () => {
      await withEnv({ FREECODE_FAKE_LLM: '1' }, () => {
        expect(resolveModel('mock:my-no-tools-model').supportsTools).toBe(false);
      });
    });

    it('throws for an unknown provider in real mode', async () => {
      await withEnv({ FREECODE_FAKE_LLM: undefined }, () => {
        expect(() => resolveModel('no-such-provider:some-model')).toThrow('Unknown provider');
      });
    });

    it('throws when no API key is configured for the provider', async () => {
      await withEnv({ FREECODE_FAKE_LLM: undefined, GROQ_API_KEY: undefined }, () => {
        expect(() => resolveModel('groq:llama-3.3-70b-versatile')).toThrow('No API key configured');
      });
    });

    it('resolves an openai-compat model when API key is present', async () => {
      await withEnv({ FREECODE_FAKE_LLM: undefined, GROQ_API_KEY: 'test-key' }, () => {
        const result = resolveModel('groq:llama-3.3-70b-versatile');
        expect(result.providerId).toBe('groq');
        expect(result.modelId).toBe('llama-3.3-70b-versatile');
        expect(result.supportsTools).toBe(true);
        expect(result.model).toBeDefined();
      });
    });

    it('resolves an anthropic model when API key is present', async () => {
      await withEnv({ FREECODE_FAKE_LLM: undefined, ANTHROPIC_API_KEY: 'test-key' }, () => {
        const result = resolveModel('anthropic:claude-sonnet-4-6');
        expect(result.providerId).toBe('anthropic');
        expect(result.modelId).toBe('claude-sonnet-4-6');
        expect(result.supportsTools).toBe(true);
        expect(result.model).toBeDefined();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Live provider init tests – each test gets a fresh module instance so the
// module-level `initializedProviders` Set starts empty every time.
// ---------------------------------------------------------------------------

describe('initDynamicProviders live fetching', () => {
  let getDeadIdsMock: ReturnType<typeof vi.fn>;
  let getProviderCacheMock: ReturnType<typeof vi.fn>;
  let updateProviderCacheMock: ReturnType<typeof vi.fn>;
  let markModelDeadMock: ReturnType<typeof vi.fn>;

  function makeFetch(patterns: Record<string, unknown>) {
    return vi.fn((url: string) => {
      for (const [pat, data] of Object.entries(patterns)) {
        if (url.includes(pat)) return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    });
  }

  beforeEach(() => {
    vi.resetModules();
    getDeadIdsMock = vi.fn().mockReturnValue([]);
    getProviderCacheMock = vi.fn().mockReturnValue(null);
    updateProviderCacheMock = vi.fn().mockReturnValue({ newIds: [], removedIds: [] });
    markModelDeadMock = vi.fn();
    vi.doMock('../../src/providers/model-cache.js', () => ({
      getDeadIds: getDeadIdsMock,
      getProviderCache: getProviderCacheMock,
      updateProviderCache: updateProviderCacheMock,
      markModelDead: markModelDeadMock,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('../../src/providers/model-cache.js');
    for (const k of [
      'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY',
      'SILICONFLOW_API_KEY', 'NVIDIA_API_KEY', 'LLM7_API_KEY', 'COHERE_API_KEY',
      'CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'OPENCODE_ZEN_API_KEY',
    ]) delete process.env[k];
  });

  it('zen always initializes via defaultApiKey and filters to free models', async () => {
    vi.stubGlobal('fetch', makeFetch({
      'opencode.ai': {
        data: [
          { id: 'gemini-flash-free', name: 'Gemini Flash Free' },
          { id: 'minimax-m3-free', name: 'Minimax M3 Free' },   // blocked by modelIdBlocklist
          { id: 'paid-model', name: 'Paid Model' },              // no -free suffix
          { id: 'big-pickle', name: 'Big Pickle' },              // ZEN_FREE_IDS
          { id: 'qwen3.6-plus-free', name: 'Retired Free' },     // ZEN_RETIRED_FREE_IDS
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const zen = PROVIDER_REGISTRY.find((p) => p.id === 'zen')!;
    const ids = zen.models.map((m) => m.id);
    expect(ids).toContain('gemini-flash-free');
    expect(ids).toContain('big-pickle');
    expect(ids).not.toContain('minimax-m3-free');
    expect(ids).not.toContain('paid-model');
    expect(ids).not.toContain('qwen3.6-plus-free');
  });

  it('zen handles array-format (non-wrapped) response', async () => {
    vi.stubGlobal('fetch', makeFetch({
      'opencode.ai': [{ id: 'array-model-free', name: 'Array Model' }],
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const zen = PROVIDER_REGISTRY.find((p) => p.id === 'zen')!;
    expect(zen.models.map((m) => m.id)).toContain('array-model-free');
  });

  it('zen maps context_length to contextWindow', async () => {
    vi.stubGlobal('fetch', makeFetch({
      'opencode.ai': { data: [{ id: 'ctx-model-free', name: 'Ctx', context_length: 8192 }] },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const zen = PROVIDER_REGISTRY.find((p) => p.id === 'zen')!;
    expect(zen.models.find((m) => m.id === 'ctx-model-free')?.contextWindow).toBe(8192);
  });

  it('openrouter fetches and filters :free models when API key is set', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.stubGlobal('fetch', makeFetch({
      'openrouter.ai': {
        data: [
          { id: 'vendor/model-a:free', name: 'Free Model', context_length: 4096 },
          { id: 'vendor/paid-model', name: 'Paid Model' },
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const or = PROVIDER_REGISTRY.find((p) => p.id === 'openrouter')!;
    expect(or.models).toContainEqual(expect.objectContaining({ id: 'vendor/model-a:free', contextWindow: 4096 }));
    expect(or.models.find((m) => m.id === 'vendor/paid-model')).toBeUndefined();
  });

  it('openrouter is skipped when no API key is set', async () => {
    const fetchMock = makeFetch({});
    vi.stubGlobal('fetch', fetchMock);
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const or = PROVIDER_REGISTRY.find((p) => p.id === 'openrouter')!;
    expect(or.models).toEqual([]);
    const calledUrls = (fetchMock.mock.calls as [string][]).map((a) => a[0]);
    expect(calledUrls.every((u) => !u.includes('openrouter.ai'))).toBe(true);
  });

  it('anthropic fetches models using display_name field and falls back to id', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.stubGlobal('fetch', makeFetch({
      'api.anthropic.com': {
        data: [
          { id: 'claude-opus-4', display_name: 'Claude Opus 4' },
          { id: 'claude-no-display' },
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const anth = PROVIDER_REGISTRY.find((p) => p.id === 'anthropic')!;
    expect(anth.models).toContainEqual(expect.objectContaining({ id: 'claude-opus-4', displayName: 'Claude Opus 4' }));
    expect(anth.models.find((m) => m.id === 'claude-no-display')?.displayName).toBe('claude-no-display');
  });

  it('generic provider applies modelIdBlocklist', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.stubGlobal('fetch', makeFetch({
      'api.groq.com': {
        data: [
          { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
          { id: 'llama-prompt-guard-8b', name: 'Prompt Guard' },
          { id: 'whisper-large-v3', name: 'Whisper' },
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const groq = PROVIDER_REGISTRY.find((p) => p.id === 'groq')!;
    const ids = groq.models.map((m) => m.id);
    expect(ids).toContain('llama-3.3-70b-versatile');
    expect(ids).not.toContain('llama-prompt-guard-8b');
    expect(ids).not.toContain('whisper-large-v3');
  });

  it('generic provider applies preferAliasOverDated', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.stubGlobal('fetch', makeFetch({
      'api.groq.com': {
        data: [
          { id: 'llama-3-70b', name: 'Llama 3 70B' },
          { id: 'llama-3-70b-2024-05-01', name: 'Llama 3 70B Dated' },
          { id: 'llama-3-8b-2024-05-01', name: 'Llama 3 8B Dated' },
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const groq = PROVIDER_REGISTRY.find((p) => p.id === 'groq')!;
    const ids = groq.models.map((m) => m.id);
    expect(ids).toContain('llama-3-70b');
    expect(ids).not.toContain('llama-3-70b-2024-05-01');
    expect(ids).toContain('llama-3-8b-2024-05-01');
  });

  it('generic provider deduplicates by displayName keeping highest versionScore (later wins)', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.stubGlobal('fetch', makeFetch({
      'api.groq.com': {
        data: [
          { id: 'llama-4-scout', name: 'Llama 4 Scout' },       // first, score 0
          { id: 'llama-4-scout-2025', name: 'Llama 4 Scout' },   // second, score 2 → wins
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const groq = PROVIDER_REGISTRY.find((p) => p.id === 'groq')!;
    expect(groq.models).toHaveLength(1);
    expect(groq.models[0].id).toBe('llama-4-scout-2025');
  });

  it('generic provider deduplicates by displayName keeping highest versionScore (first wins)', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.stubGlobal('fetch', makeFetch({
      'api.groq.com': {
        data: [
          { id: 'llama-2026', name: 'Llama Versioned' },   // first, score 2 → stays as best
          { id: 'llama-base', name: 'Llama Versioned' },    // second, score 0 → best doesn't change
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const groq = PROVIDER_REGISTRY.find((p) => p.id === 'groq')!;
    expect(groq.models).toHaveLength(1);
    expect(groq.models[0].id).toBe('llama-2026');
  });

  it('modelIdExactBlocklist filters exact IDs (not substring matches)', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', makeFetch({
      'api.openai.com': {
        data: [
          { id: 'gpt-4o', name: 'GPT-4o' },
          { id: 'chat-latest', name: 'Chat Latest' },
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const openai = PROVIDER_REGISTRY.find((p) => p.id === 'openai')!;
    const ids = openai.models.map((m) => m.id);
    expect(ids).toContain('gpt-4o');
    expect(ids).not.toContain('chat-latest');
  });

  it('modelTierBlocklist excludes models by tier field', async () => {
    process.env.LLM7_API_KEY = 'test-key';
    vi.stubGlobal('fetch', makeFetch({
      'api.llm7.io': {
        data: [
          { id: 'free-model', name: 'Free Model', tier: 'free' },
          { id: 'pro-model', name: 'Pro Model', tier: 'pro' },
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const llm7 = PROVIDER_REGISTRY.find((p) => p.id === 'llm7')!;
    const ids = llm7.models.map((m) => m.id);
    expect(ids).toContain('free-model');
    expect(ids).not.toContain('pro-model');
  });

  it('context_window object with tokens/chars fields is mapped and displayName falls back to id', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.stubGlobal('fetch', makeFetch({
      'api.groq.com': {
        data: [
          { id: 'model-a', name: 'A', context_window: { tokens: 8192 } },
          { id: 'model-b', name: 'B', context_window: { chars: 4096 } },
          { id: 'model-c', name: 'C', context_window: 2048 },
          { id: 'model-d', name: 'D', context_window: null },
          { id: 'model-e', name: 'E' },
          { id: 'model-no-name', context_window: 512 }, // no name field → displayName falls back to id
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const groq = PROVIDER_REGISTRY.find((p) => p.id === 'groq')!;
    expect(groq.models.find((m) => m.id === 'model-a')?.contextWindow).toBe(8192);
    expect(groq.models.find((m) => m.id === 'model-b')?.contextWindow).toBe(4096);
    expect(groq.models.find((m) => m.id === 'model-c')?.contextWindow).toBe(2048);
    expect(groq.models.find((m) => m.id === 'model-d')?.contextWindow).toBeUndefined();
    expect(groq.models.find((m) => m.id === 'model-e')?.contextWindow).toBeUndefined();
    expect(groq.models.find((m) => m.id === 'model-no-name')?.displayName).toBe('model-no-name');
  });

  it('generic provider deduplicates by displayName keeping semver-scored id', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.stubGlobal('fetch', makeFetch({
      'api.groq.com': {
        data: [
          { id: 'llama-chat', name: 'Llama Chat' },
          { id: 'llama-chat-v1.5', name: 'Llama Chat' }, // semver → versionScore 1 wins
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const groq = PROVIDER_REGISTRY.find((p) => p.id === 'groq')!;
    expect(groq.models).toHaveLength(1);
    expect(groq.models[0].id).toBe('llama-chat-v1.5');
  });

  it('zen with object response missing data field yields empty models', async () => {
    vi.stubGlobal('fetch', makeFetch({
      'opencode.ai': {}, // object without data → data ?? [] → []
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const zen = PROVIDER_REGISTRY.find((p) => p.id === 'zen')!;
    expect(zen.models).toEqual([]);
  });

  it('generic provider handles array-format response', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.stubGlobal('fetch', makeFetch({
      'api.groq.com': [{ id: 'direct-array-model', name: 'Array Model' }],
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const groq = PROVIDER_REGISTRY.find((p) => p.id === 'groq')!;
    expect(groq.models.map((m) => m.id)).toContain('direct-array-model');
  });

  it('generic provider with object response missing data field yields empty models', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    vi.stubGlobal('fetch', makeFetch({
      'api.groq.com': {}, // object without data → data ?? [] → []
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const groq = PROVIDER_REGISTRY.find((p) => p.id === 'groq')!;
    expect(groq.models).toEqual([]);
  });

  it('falls back to cached models when fetch fails', async () => {
    getProviderCacheMock.mockImplementation((id: string) =>
      id === 'zen'
        ? { models: [{ id: 'cached-zen-free', displayName: 'Cached Zen' }], newIds: [] }
        : null,
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const zen = PROVIDER_REGISTRY.find((p) => p.id === 'zen')!;
    expect(zen.models).toContainEqual(expect.objectContaining({ id: 'cached-zen-free' }));
  });

  it('HTTP error from fetch triggers cache fallback', async () => {
    getProviderCacheMock.mockImplementation((id: string) =>
      id === 'zen'
        ? { models: [{ id: 'fallback-model-free', displayName: 'Fallback' }], newIds: [] }
        : null,
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const zen = PROVIDER_REGISTRY.find((p) => p.id === 'zen')!;
    expect(zen.models).toContainEqual(expect.objectContaining({ id: 'fallback-model-free' }));
  });

  it('dead models are excluded from live fetch results', async () => {
    getDeadIdsMock.mockImplementation((id: string) =>
      id === 'zen' ? ['dead-model-free'] : [],
    );
    vi.stubGlobal('fetch', makeFetch({
      'opencode.ai': {
        data: [
          { id: 'dead-model-free', name: 'Dead' },
          { id: 'live-model-free', name: 'Live' },
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const zen = PROVIDER_REGISTRY.find((p) => p.id === 'zen')!;
    const ids = zen.models.map((m) => m.id);
    expect(ids).not.toContain('dead-model-free');
    expect(ids).toContain('live-model-free');
  });

  it('new model IDs from updateProviderCache are flagged with isNew', async () => {
    updateProviderCacheMock.mockReturnValue({ newIds: ['new-model-free'], removedIds: [] });
    vi.stubGlobal('fetch', makeFetch({
      'opencode.ai': {
        data: [
          { id: 'new-model-free', name: 'New' },
          { id: 'old-model-free', name: 'Old' },
        ],
      },
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const zen = PROVIDER_REGISTRY.find((p) => p.id === 'zen')!;
    expect(zen.models.find((m) => m.id === 'new-model-free')?.isNew).toBe(true);
    expect(zen.models.find((m) => m.id === 'old-model-free')?.isNew).toBeUndefined();
  });

  it('concurrent initDynamicProviders calls share one underlying fetch (initPromise memoization)', async () => {
    let fetchCount = 0;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('opencode.ai')) fetchCount++;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    }));
    const { initDynamicProviders } = await import('../../src/providers/registry.js');
    // Simulate startup warm (e.g. from getSelectableModels) racing the user opening /model.
    const p1 = initDynamicProviders();
    const p2 = initDynamicProviders();
    await Promise.all([p1, p2]);
    expect(fetchCount).toBe(1);
  });

  it('provider is not re-initialized when already in initializedProviders', async () => {
    const calledUrls: string[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      calledUrls.push(url);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: 'model-free', name: 'M' }] }) });
    }));
    const { initDynamicProviders } = await import('../../src/providers/registry.js');
    await initDynamicProviders();
    const zenCallsAfterFirst = calledUrls.filter((u) => u.includes('opencode.ai')).length;
    await initDynamicProviders();
    const zenCallsAfterSecond = calledUrls.filter((u) => u.includes('opencode.ai')).length;
    expect(zenCallsAfterFirst).toBe(1);
    expect(zenCallsAfterSecond).toBe(1);
  });

  it('anthropic falls back to cache on HTTP error', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    getProviderCacheMock.mockImplementation((id: string) =>
      id === 'anthropic'
        ? { models: [{ id: 'claude-cached', displayName: 'Claude Cached' }], newIds: [] }
        : null,
    );
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('api.anthropic.com')) return Promise.resolve({ ok: false, status: 503 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const anth = PROVIDER_REGISTRY.find((p) => p.id === 'anthropic')!;
    expect(anth.models).toContainEqual(expect.objectContaining({ id: 'claude-cached' }));
  });

  it('generic provider falls back to cache on HTTP error', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    getProviderCacheMock.mockImplementation((id: string) =>
      id === 'groq'
        ? { models: [{ id: 'cached-groq', displayName: 'Cached Groq' }], newIds: [] }
        : null,
    );
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('api.groq.com')) return Promise.resolve({ ok: false, status: 403 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    }));
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const groq = PROVIDER_REGISTRY.find((p) => p.id === 'groq')!;
    expect(groq.models).toContainEqual(expect.objectContaining({ id: 'cached-groq' }));
  });

  it('generic provider with no API key is skipped entirely', async () => {
    // All provider env vars unset; only zen (defaultApiKey) will attempt init
    const fetchMock = makeFetch({});
    vi.stubGlobal('fetch', fetchMock);
    const { initDynamicProviders, PROVIDER_REGISTRY } = await import('../../src/providers/registry.js');
    await initDynamicProviders();

    const groq = PROVIDER_REGISTRY.find((p) => p.id === 'groq')!;
    expect(groq.models).toEqual([]);
    const calledUrls = (fetchMock.mock.calls as [string][]).map((a) => a[0]);
    expect(calledUrls.every((u) => !u.includes('api.groq.com'))).toBe(true);
  });
});
