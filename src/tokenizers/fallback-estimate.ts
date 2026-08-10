/**
 * @role The permanent fallback token estimator for any model with no exact tokenizer backend — a real `o200k_base` BPE count for the wrong model family, not a chars/4 heuristic. Replaces the deleted `src/agent/token-count.ts`.
 */

import type { CoreMessage } from 'ai';
import { getEncoding } from 'js-tiktoken';
import { countContextTokens, countMessageTokens } from './chat-format.js';

let fallbackEncoder: ReturnType<typeof getEncoding> | null = null;

function getFallbackEncoder(): ReturnType<typeof getEncoding> {
  if (!fallbackEncoder) fallbackEncoder = getEncoding('o200k_base');
  return fallbackEncoder;
}

/**
 * Real BPE token count for the wrong model family — the permanent fallback
 * for any model with no exact tokenizer backend, not a stopgap. Special-token
 * strings (e.g. "<|endoftext|>") are encoded as ordinary text via empty
 * allowed/disallowed-special lists: js-tiktoken throws on them by default,
 * but a real chat request sends user content as plain text too, so this is
 * both the accurate and the non-throwing behavior.
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return getFallbackEncoder().encode(text, [], []).length;
}

/** Thin wrapper over `chat-format.ts`'s `countMessageTokens`, bound to `estimateTextTokens`. */
export function estimateMessageTokens(message: CoreMessage): number {
  return countMessageTokens(message, estimateTextTokens);
}

/** Thin wrapper over `chat-format.ts`'s `countContextTokens`, bound to `estimateTextTokens`. */
export function estimateContextTokens(messages: CoreMessage[]): number {
  return countContextTokens(messages, estimateTextTokens);
}
