import { describe, it, expect } from 'vitest';
import { openAIModelDisallowsTemperature, mistralCodestralRequiresSystemInjection, injectSystemIntoFirstUserMessage } from '../../src/providers/model-quirks.js';

describe('model-quirks', () => {
  describe('openAIModelDisallowsTemperature', () => {
    it('matches o1, o3, gpt-5 family', () => {
      expect(openAIModelDisallowsTemperature('o1')).toBe(true);
      expect(openAIModelDisallowsTemperature('o1-mini')).toBe(true);
      expect(openAIModelDisallowsTemperature('o3')).toBe(true);
      expect(openAIModelDisallowsTemperature('o3-mini')).toBe(true);
      expect(openAIModelDisallowsTemperature('gpt-5')).toBe(true);
      expect(openAIModelDisallowsTemperature('gpt-5.5')).toBe(true);
      expect(openAIModelDisallowsTemperature('gpt-5.5-2026-05-01')).toBe(true);
    });

    it('does not match unrelated model IDs', () => {
      expect(openAIModelDisallowsTemperature('gpt-4o')).toBe(false);
      expect(openAIModelDisallowsTemperature('openai/gpt-5.5')).toBe(false);
      expect(openAIModelDisallowsTemperature('llama-3.3-70b')).toBe(false);
      expect(openAIModelDisallowsTemperature('notO1')).toBe(false);
    });
  });

  describe('mistralCodestralRequiresSystemInjection', () => {
    it('matches codestral model IDs', () => {
      expect(mistralCodestralRequiresSystemInjection('codestral-2508')).toBe(true);
      expect(mistralCodestralRequiresSystemInjection('codestral-latest')).toBe(true);
      expect(mistralCodestralRequiresSystemInjection('codestral-2501')).toBe(true);
    });

    it('does not match non-codestral models', () => {
      expect(mistralCodestralRequiresSystemInjection('mistral-large-2512')).toBe(false);
      expect(mistralCodestralRequiresSystemInjection('devstral-2512')).toBe(false);
      expect(mistralCodestralRequiresSystemInjection('ministral-8b-2512')).toBe(false);
    });
  });

  describe('injectSystemIntoFirstUserMessage', () => {
    it('prepends system content to the first user message', () => {
      const messages = [
        { role: 'system', content: 'You are a coding agent.' },
        { role: 'user', content: 'Hello' },
      ];
      const result = injectSystemIntoFirstUserMessage(messages);
      expect(result).toEqual([{ role: 'user', content: 'You are a coding agent.\n\nHello' }]);
    });

    it('removes the system message even if no user message follows', () => {
      const messages = [{ role: 'system', content: 'Sys' }];
      const result = injectSystemIntoFirstUserMessage(messages);
      expect(result).toEqual([]);
    });

    it('is a no-op when there is no system message', () => {
      const messages = [{ role: 'user', content: 'Hi' }];
      expect(injectSystemIntoFirstUserMessage(messages)).toEqual(messages);
    });

    it('preserves other message fields and earlier messages before first user', () => {
      const messages = [
        { role: 'system', content: 'Sys' },
        { role: 'assistant', content: 'Intro' },
        { role: 'user', content: 'Q', extra: 'val' },
      ];
      const result = injectSystemIntoFirstUserMessage(messages);
      expect(result).toEqual([
        { role: 'assistant', content: 'Intro' },
        { role: 'user', content: 'Sys\n\nQ', extra: 'val' },
      ]);
    });
  });
});
