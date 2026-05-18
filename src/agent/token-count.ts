import type { CoreMessage } from 'ai';
import { buildSystemPrompt } from './system-prompt.js';

const TOKENS_PER_MESSAGE_OVERHEAD = 4;
const TOKENS_PER_REQUEST_OVERHEAD = 2;

function stringifyContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(stringifyContent).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['text'] === 'string') return record['text'];
    if (typeof record['content'] === 'string') return record['content'];
    return JSON.stringify(value);
  }
  return String(value);
}

export function estimateTextTokens(text: string): number {
  const chunks = text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? [];
  return chunks.reduce((total, chunk) => {
    if (/^[A-Za-z0-9_]+$/.test(chunk)) {
      return total + Math.max(1, Math.ceil(chunk.length / 4));
    }
    return total + 1;
  }, 0);
}

export function estimateMessageTokens(message: CoreMessage): number {
  return TOKENS_PER_MESSAGE_OVERHEAD
    + estimateTextTokens(message.role)
    + estimateTextTokens(stringifyContent(message.content));
}

export function estimateContextTokens(messages: CoreMessage[]): number {
  return TOKENS_PER_REQUEST_OVERHEAD
    + estimateTextTokens(buildSystemPrompt())
    + messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}
