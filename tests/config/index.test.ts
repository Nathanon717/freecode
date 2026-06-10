import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/logger.js', () => ({ log: vi.fn(), logError: vi.fn(), enableLog: vi.fn() }));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

describe('Config Module', () => {
  const apiKeysToClear = [
    'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'SILICONFLOW_API_KEY',
    'NVIDIA_API_KEY', 'LLM7_API_KEY', 'GITHUB_TOKEN', 'COHERE_API_KEY',
    'CEREBRAS_API_KEY', 'MISTRAL_API_KEY', 'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY', 'CLOUDFLARE_API_KEY', 'ZAI_API_KEY',
    'HF_TOKEN', 'OPENCODE_ZEN_API_KEY',
  ];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const key of apiKeysToClear) {
      delete process.env[key];
    }
  });

  describe('loadConfig', () => {
    it('should return default config when no files exist', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      const { loadConfig } = await import('../../src/config/index.js');
      const config = loadConfig();

      expect(config.toolRationale).toBe(true);
      expect(config.providers).toEqual({});
    });

    it('should load from global config file', async () => {
      const { existsSync, readFileSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        preferredModel: 'groq:test-model',
        toolRationale: false,
        providers: {
          groq: { apiKey: 'test-key' }
        }
      }));

      const { loadConfig } = await import('../../src/config/index.js');
      const config = loadConfig();

      expect(config.preferredModel).toBe('groq:test-model');
      expect(config.toolRationale).toBe(false);
      expect(config.providers.groq?.apiKey).toBe('test-key');
    });

    it('should load API key from environment variable', async () => {
      const { existsSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(false);

      process.env.GROQ_API_KEY = 'env-api-key';

      const { loadConfig } = await import('../../src/config/index.js');
      const config = loadConfig();

      expect(config.providers.groq?.apiKey).toBe('env-api-key');
    });

    it('should prioritize config file over defaults', async () => {
      const { existsSync, readFileSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        toolRationale: false
      }));

      const { loadConfig } = await import('../../src/config/index.js');
      const config = loadConfig();

      expect(config.toolRationale).toBe(false);
    });

    it('should handle malformed JSON gracefully', async () => {
      const { existsSync, readFileSync } = await import('fs');
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('invalid json');

      const { loadConfig } = await import('../../src/config/index.js');
      const config = loadConfig();

      expect(config.toolRationale).toBe(true);
    });
  });
});
