import type { CoreMessage } from 'ai';
import { getEncoding } from 'js-tiktoken';
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../../../src/agent/system-prompt.js';
import { createTiktokenEncoder, getGptOssEncoder } from '../../../src/tokenizers/backends/tiktoken.js';
import { estimateContextTokens } from '../../../src/tokenizers/fallback-estimate.js';

const enc = getEncoding('o200k_base');

describe('createTiktokenEncoder', () => {
  it('counts request overhead, system prompt, and messages against the real BPE encoding', () => {
    const messages: CoreMessage[] = [
      { role: 'user', content: 'Summarize this project.' },
      { role: 'assistant', content: 'This is a TypeScript CLI coding agent.' },
    ];
    const expected = 2 + enc.encode(buildSystemPrompt()).length
      + messages.reduce((total, m) => total + 4 + enc.encode(m.role).length + enc.encode(m.content as string).length, 0);
    expect(createTiktokenEncoder(enc).countMessages(messages)).toBe(expected);
  });

  it('never throws on message content containing a tiktoken special-token string', () => {
    const messages: CoreMessage[] = [{ role: 'user', content: 'pasted: <|endoftext|>' }];
    expect(() => createTiktokenEncoder(enc).countMessages(messages)).not.toThrow();
  });
});

describe('getGptOssEncoder', () => {
  it('returns the same memoized encoder on repeated calls', () => {
    expect(getGptOssEncoder()).toBe(getGptOssEncoder());
  });

  // KNOWN INACCURACY (see backends/tiktoken.ts): GPT-OSS's real "o200k_harmony"
  // encoding reuses o200k_base's BPE ranks exactly, and the harmony-only
  // special tokens never activate under encode(text, [], []), so today this
  // produces byte-identical counts to the generic fallback. This test pins
  // that fact so it can't silently drift into looking "more exact" than it
  // is without the caveat comment being revisited.
  it('currently produces the same counts as the generic fallback (harmony wrapper overhead not modeled)', () => {
    const messages: CoreMessage[] = [
      { role: 'user', content: '<|start|>user<|message|>hi<|end|>' },
      { role: 'assistant', content: 'plain response text' },
    ];
    expect(getGptOssEncoder().countMessages(messages)).toBe(estimateContextTokens(messages));
  });
});
