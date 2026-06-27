import type { RateLimitSnapshot } from '../quota/headers.js';
import {
  parseMistralRateLimitSnapshot,
  parseCerebrasRateLimitSnapshot,
  parseGroqRateLimitHeaders,
  groqHeadersToSnapshot,
} from '../quota/headers.js';
import { stripTemperatureIfDisallowed, stripStreamForNonStream, injectCodestralSystem } from './openai-compat-request.js';

// Per-provider static quirk profiles. Providers absent from the map get the
// default path (no transforms, no rate-limit capture, no extra headers).
// Code, not data — intentionally separate from ProviderConfig which is DB-backed.

export interface OpenAICompatQuirks {
  staticHeaders?: Record<string, string>;
  transformRequest?: (body: Record<string, unknown>) => { body: Record<string, unknown>; forcedNonStream?: boolean };
  captureRateLimits?: boolean;
  parseRateLimitSnapshot?: (headers: Headers) => RateLimitSnapshot;
  /** Returns a hint string to append after HTTP error details, or null. Called only on non-OK responses. */
  httpErrorHint?: (response: Response) => string | null;
}

export const providerQuirks: Record<string, OpenAICompatQuirks> = {
  openrouter: {
    staticHeaders: {
      'HTTP-Referer': 'https://freecode.local',
      'X-Title': 'freecode',
    },
    httpErrorHint: (response) =>
      response.status === 429
        ? ' OpenRouter rate limits can come from OpenRouter or the upstream model provider; try again later or switch models/providers.'
        : null,
  },
  mistral: {
    captureRateLimits: true,
    parseRateLimitSnapshot: parseMistralRateLimitSnapshot,
    transformRequest: (body) => {
      const { body: stripped, forcedNonStream } = stripStreamForNonStream(body);
      return { body: injectCodestralSystem(stripped), forcedNonStream };
    },
  },
  cerebras: {
    captureRateLimits: true,
    parseRateLimitSnapshot: parseCerebrasRateLimitSnapshot,
  },
  groq: {
    captureRateLimits: true,
    parseRateLimitSnapshot: (h) => groqHeadersToSnapshot(parseGroqRateLimitHeaders(h)),
  },
  openai: {
    transformRequest: (body) => ({ body: stripTemperatureIfDisallowed(body) }),
  },
};
