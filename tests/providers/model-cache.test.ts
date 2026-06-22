import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

describe('model-cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('updateProviderCache — first fetch', () => {
    it('returns empty newIds', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const { updateProviderCache } = await import('../../src/providers/model-cache.js');
      const result = updateProviderCache('groq', [
        { id: 'llama-3.3-70b', displayName: 'Llama 3.3 70B' },
        { id: 'llama-3.1-8b', displayName: 'Llama 3.1 8B' },
      ]);

      expect(result.newIds).toEqual([]);
      expect(result.removedIds).toEqual([]);
    });

    it('saves the initial model list to cache on first fetch', async () => {
      const { existsSync, writeFileSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const { updateProviderCache } = await import('../../src/providers/model-cache.js');
      updateProviderCache('groq', [{ id: 'llama-3.3-70b', displayName: 'Llama 3.3 70B' }]);

      expect(vi.mocked(writeFileSync)).toHaveBeenCalled();
    });
  });

  describe('updateProviderCache — subsequent fetches (prior cache exists)', () => {
    it('detects genuinely new models on subsequent fetch', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        groq: {
          fetchedAt: '2025-01-01T00:00:00Z',
          models: [{ id: 'llama-3.3-70b', displayName: 'Llama 3.3 70B' }],
          newIds: [],
          removedIds: [],
        },
      }));

      const { updateProviderCache } = await import('../../src/providers/model-cache.js');
      const result = updateProviderCache('groq', [
        { id: 'llama-3.3-70b', displayName: 'Llama 3.3 70B' },
        { id: 'llama-4-scout', displayName: 'Llama 4 Scout' },
      ]);

      expect(result.newIds).toEqual(['llama-4-scout']);
      expect(result.removedIds).toEqual([]);
    });

    it('detects removed models on subsequent fetch', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        groq: {
          fetchedAt: '2025-01-01T00:00:00Z',
          models: [
            { id: 'llama-3.3-70b', displayName: 'Llama 3.3 70B' },
            { id: 'llama-3.1-8b', displayName: 'Llama 3.1 8B' },
          ],
          newIds: [],
          removedIds: [],
        },
      }));

      const { updateProviderCache } = await import('../../src/providers/model-cache.js');
      const result = updateProviderCache('groq', [
        { id: 'llama-3.3-70b', displayName: 'Llama 3.3 70B' },
      ]);

      expect(result.newIds).toEqual([]);
      expect(result.removedIds).toEqual(['llama-3.1-8b']);
    });

    it('returns empty arrays and skips save when nothing changed', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        groq: {
          fetchedAt: '2025-01-01T00:00:00Z',
          models: [{ id: 'llama-3.3-70b', displayName: 'Llama 3.3 70B' }],
          newIds: [],
          removedIds: [],
        },
      }));

      const { updateProviderCache } = await import('../../src/providers/model-cache.js');
      const result = updateProviderCache('groq', [
        { id: 'llama-3.3-70b', displayName: 'Llama 3.3 70B' },
      ]);

      expect(result.newIds).toEqual([]);
      expect(result.removedIds).toEqual([]);
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled();
    });

    it('detects both added and removed models simultaneously', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        groq: {
          fetchedAt: '2025-01-01T00:00:00Z',
          models: [
            { id: 'llama-3.3-70b', displayName: 'Llama 3.3 70B' },
            { id: 'llama-3.1-8b', displayName: 'Llama 3.1 8B' },
          ],
          newIds: [],
          removedIds: [],
        },
      }));

      const { updateProviderCache } = await import('../../src/providers/model-cache.js');
      const result = updateProviderCache('groq', [
        { id: 'llama-3.3-70b', displayName: 'Llama 3.3 70B' },
        { id: 'llama-4-scout', displayName: 'Llama 4 Scout' },
      ]);

      expect(result.newIds).toEqual(['llama-4-scout']);
      expect(result.removedIds).toEqual(['llama-3.1-8b']);
    });
  });
});
