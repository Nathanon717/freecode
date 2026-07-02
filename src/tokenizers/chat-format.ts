import type { CoreMessage } from 'ai';
import { buildSystemPrompt } from '../agent/system-prompt.js';

export const TOKENS_PER_MESSAGE_OVERHEAD = 4;
export const TOKENS_PER_REQUEST_OVERHEAD = 2;

export function stringifyMessageContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  /* v8 ignore next -- a well-typed CoreMessage content is never a bare number/boolean */
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(stringifyMessageContent).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['text'] === 'string') return record['text'];
    if (typeof record['content'] === 'string') return record['content'];
    return JSON.stringify(value);
  }
  /* v8 ignore next 2 -- a well-typed CoreMessage content is never a bigint/symbol/function */
  if (typeof value === 'bigint' || typeof value === 'symbol') return String(value);
  return '';
}

// Shared chat-overhead formula for any BPE-style encoder: a fixed per-message
// overhead plus the encoder's own token count for the role and stringified
// content. Every tokenizer backend (fallback estimate, tiktoken family, and
// future HF/SentencePiece/Tekken families) counts messages this way, only the
// encodeText function differs.
export function countMessageTokens(message: CoreMessage, encodeText: (text: string) => number): number {
  return TOKENS_PER_MESSAGE_OVERHEAD
    + encodeText(message.role)
    + encodeText(stringifyMessageContent(message.content));
}

export function countContextTokens(messages: CoreMessage[], encodeText: (text: string) => number): number {
  return TOKENS_PER_REQUEST_OVERHEAD
    + encodeText(buildSystemPrompt())
    + messages.reduce((total, message) => total + countMessageTokens(message, encodeText), 0);
}
