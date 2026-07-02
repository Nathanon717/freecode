import { Tokenizer } from '@huggingface/tokenizers';
import type { CoreMessage } from 'ai';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../../../src/agent/system-prompt.js';
import { loadBpeJsonEncoder } from '../../../src/tokenizers/backends/bpe-json.js';

// typescript-eslint's typed lint fails to resolve @huggingface/tokenizers'
// nested "exports" conditions (plain tsc resolves and types it fine) — see
// the same note in src/tokenizers/backends/bpe-json.ts.
interface HfTokenizer {
  encode(text: string, options?: { add_special_tokens?: boolean }): { ids: number[] };
}

const _dirname = dirname(fileURLToPath(import.meta.url));
// A tiny, real (not stubbed) tokenizer.json: Whitespace pre-tokenizer + a
// 6-entry BPE vocab/merges table that greedily merges "a"+"b"+"c" -> "abc".
// Exercises the real @huggingface/tokenizers BPE algorithm without needing a
// multi-MB production vocab file in the repo.
const MINI_FIXTURE = resolve(_dirname, '..', 'fixtures', 'mini-tokenizer.json');
const json = JSON.parse(readFileSync(MINI_FIXTURE, 'utf-8')) as object;
// eslint-disable-next-line @typescript-eslint/no-unsafe-call -- see HfTokenizer note above
const rawTokenizer = new Tokenizer(json, {}) as HfTokenizer;
const encode = (text: string) => rawTokenizer.encode(text, { add_special_tokens: false }).ids.length;

describe('loadBpeJsonEncoder', () => {
  // "abc" greedily merges to the single vocab entry "abc"; "xyz" has no
  // single-char entries in this fixture's tiny vocab, so it decomposes into
  // 3 unk tokens instead — both paths run through the real BPE algorithm.
  it.each([
    [[{ role: 'user', content: 'abc' }, { role: 'assistant', content: 'a b c' }]],
    [[{ role: 'user', content: 'xyz' }]],
    [[{ role: 'user', content: '' }]],
    [[]],
  ] as [CoreMessage[]][])('counts request overhead, system prompt, and messages for %j against the real BPE merge algorithm', (messages) => {
    const expected = 2 + encode(buildSystemPrompt())
      + messages.reduce((total, m) => total + 4 + encode(m.role) + encode(m.content as string), 0);
    expect(loadBpeJsonEncoder(MINI_FIXTURE).countMessages(messages)).toBe(expected);
  });
});
