import { describe, it, expect } from 'vitest';

describe('Router Logic', () => {
  describe('provider API format detection', () => {
    function getApiFormat(providerId: string): 'openai' | 'cohere' {
      if (providerId === 'cohere') return 'cohere';
      return 'openai';
    }

    it('should detect Cohere format', () => {
      expect(getApiFormat('cohere')).toBe('cohere');
    });

    it('should default to OpenAI format', () => {
      expect(getApiFormat('groq')).toBe('openai');
      expect(getApiFormat('openrouter')).toBe('openai');
      expect(getApiFormat('ollama')).toBe('openai');
    });
  });

  describe('OpenRouter headers', () => {
    function getOpenRouterHeaders(): Record<string, string> {
      return {
        'HTTP-Referer': 'https://freecode.local',
        'X-Title': 'freecode',
      };
    }

    it('should include required headers', () => {
      const headers = getOpenRouterHeaders();
      expect(headers['HTTP-Referer']).toBe('https://freecode.local');
      expect(headers['X-Title']).toBe('freecode');
    });
  });
});
