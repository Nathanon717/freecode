import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadTekkenEncoder } from '../../../src/tokenizers/backends/tekken.js';

// A tiny hand-built tekken.json exercising the real load path (vocab slice →
// bpe_ranks string → js-tiktoken BPE) without a production-size 150k vocab —
// mirrors Phase 3's mini-tokenizer.json approach. Vocab: all 256 single bytes
// (so any input encodes with no unknowns) plus two BPE merges, "ab" and "abc".
// "abc" is placed *beyond* the vocab_size boundary so the slice must drop it.
function writeFixture(dir: string): string {
  const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');
  const vocab: { rank: number; token_bytes: string }[] = [];
  for (let i = 0; i < 256; i++) vocab.push({ rank: i, token_bytes: b64([i]) });
  vocab.push({ rank: 256, token_bytes: b64([0x61, 0x62]) }); // "ab" — inside the slice
  vocab.push({ rank: 257, token_bytes: b64([0x61, 0x62, 0x63]) }); // "abc" — padding, must be dropped
  const tekken = {
    config: {
      // Group letter runs into one pre-token so BPE can merge across "abc".
      pattern: '[A-Za-z]+|[\\s\\S]',
      default_vocab_size: 257, // inner = 257 - 0 = 257 → slice(0,257) keeps rank 256, drops 257
      default_num_special_tokens: 0,
    },
    vocab,
  };
  const path = join(dir, 'tekken.json');
  writeFileSync(path, JSON.stringify(tekken));
  return path;
}

describe('loadTekkenEncoder', () => {
  let dir: string;
  beforeEach(() => {
    dir = join(tmpdir(), `freecode-tekken-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('applies BPE merges from the vocab (real byte-BPE, not a char count)', () => {
    const enc = loadTekkenEncoder(writeFixture(dir));
    // "ab" is one merged token; countMessages adds the flat per-message overhead,
    // so assert the *difference* between two inputs to isolate the content tokens.
    const one = enc.countMessages([{ role: 'user', content: 'ab' }]);
    const two = enc.countMessages([{ role: 'user', content: 'xy' }]); // no merge: x + y
    expect(two - one).toBe(1); // "ab"→1 token, "xy"→2 tokens
  });

  it('enforces the vocab-slice boundary (drops padding ranks past default_vocab_size)', () => {
    const enc = loadTekkenEncoder(writeFixture(dir));
    // "abc": the "ab" merge (rank 256, kept) applies, but "abc" (rank 257, sliced
    // out) does not → ["ab","c"] = 2 tokens. Without the slice it would be 1.
    const abc = enc.countMessages([{ role: 'user', content: 'abc' }]);
    const ab = enc.countMessages([{ role: 'user', content: 'ab' }]);
    expect(abc - ab).toBe(1); // "abc" is exactly one token longer than "ab"
  });

  it('never throws on content containing special-token-looking literals', () => {
    const enc = loadTekkenEncoder(writeFixture(dir));
    expect(() => enc.countMessages([{ role: 'user', content: 'x <|endoftext|> y' }])).not.toThrow();
  });
});
