import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/logger.js', () => ({ logError: vi.fn() }));

vi.mock('../src/providers/model-cache.js', () => ({
  getProviderCache: vi.fn(() => null),
  updateProviderCache: vi.fn(() => ({ newIds: [], removedIds: [] })),
}));

vi.mock('../src/providers/canonical-models.js', () => ({
  syncLiveModels: vi.fn(),
}));

vi.mock('../src/config/index.js', () => ({
  resolveApiKey: vi.fn((provider: { id: string }) => provider.id === 'groq' ? 'config-groq-key' : undefined),
}));

describe('dynamic provider initialization', () => {
  it('uses config-resolved API keys when fetching live models', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      data: [{ id: 'llama-test', name: 'Llama Test' }],
    }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    const { initDynamicProviders } = await import('../src/providers/registry.js');
    await initDynamicProviders();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer config-groq-key' },
      }),
    );
  });
});
