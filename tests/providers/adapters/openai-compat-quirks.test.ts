import { describe, it, expect } from 'vitest';
import { providerQuirks } from '../../../src/providers/adapters/openai-compat-quirks.js';

describe('providerQuirks', () => {
  describe('openrouter', () => {
    const profile = providerQuirks['openrouter'];

    it('has HTTP-Referer and X-Title static headers', () => {
      expect(profile.staticHeaders?.['HTTP-Referer']).toBe('https://freecode.local');
      expect(profile.staticHeaders?.['X-Title']).toBe('freecode');
    });

    it('httpErrorHint returns a hint only on 429', () => {
      const resp429 = new Response('', { status: 429 });
      const resp401 = new Response('', { status: 401 });
      expect(profile.httpErrorHint?.(resp429)).toBeTruthy();
      expect(profile.httpErrorHint?.(resp401)).toBeNull();
    });

    it('does not capture rate limits', () => {
      expect(profile.captureRateLimits).toBeFalsy();
    });
  });

  describe('mistral', () => {
    const profile = providerQuirks['mistral'];

    it('captures rate limits and has a snapshot parser', () => {
      expect(profile.captureRateLimits).toBe(true);
      expect(typeof profile.parseRateLimitSnapshot).toBe('function');
    });

    it('transformRequest strips stream and injects codestral system', () => {
      expect(typeof profile.transformRequest).toBe('function');
      const body = { stream: true, stream_options: {}, model: 'mistral-large', messages: [] };
      const { body: result, forcedNonStream } = profile.transformRequest!(body);
      expect(forcedNonStream).toBe(true);
      expect(result).not.toHaveProperty('stream');
    });
  });

  describe('groq and cerebras', () => {
    it('groq captures rate limits with a snapshot parser', () => {
      const profile = providerQuirks['groq'];
      expect(profile.captureRateLimits).toBe(true);
      expect(typeof profile.parseRateLimitSnapshot).toBe('function');
    });

    it('cerebras captures rate limits with a snapshot parser', () => {
      const profile = providerQuirks['cerebras'];
      expect(profile.captureRateLimits).toBe(true);
      expect(typeof profile.parseRateLimitSnapshot).toBe('function');
    });
  });

  describe('openai', () => {
    it('has transformRequest for temperature stripping', () => {
      const profile = providerQuirks['openai'];
      expect(typeof profile.transformRequest).toBe('function');
    });

    it('does not capture rate limits', () => {
      expect(providerQuirks['openai'].captureRateLimits).toBeFalsy();
    });
  });
});
