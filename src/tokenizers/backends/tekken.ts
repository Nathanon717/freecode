/**
 * @role Loads a cached Mistral `tekken.json` into a `js-tiktoken` `TokenizerEncoder`. Backs the modern Mistral line (NeMo-era and newer) registered as `MISTRAL_TEKKEN_FAMILY` in `model-family.ts`. Tekken is a tiktoken-based byte-BPE tokenizer in a non-standard file layout, so this reuses `tiktoken.ts`'s `createTiktokenEncoder` rather than a separate engine.
 *
 * @readwhen
 * - Adding another Tekken-era Mistral model: extend the `isMistralTekken` predicate in `model-family.ts`, not here — this file is family-agnostic and one canonical repo covers the whole line.
 */

import { Tiktoken } from 'js-tiktoken';
import { createTiktokenEncoder } from './tiktoken.js';
import type { TokenizerEncoder } from '../count.js';
import { readJsonFile } from '../../util/text-encoding.js';

// Mistral's tekken.json is a tiktoken-based byte-BPE tokenizer in a non-standard
// layout: { config, vocab } where vocab is [{rank, token_bytes(base64), ...}] and
// config.pattern is the pre-tokenizer regex. It parses into plain vocab+ranks that
// js-tiktoken consumes directly — no mistral-common preprocessing. Verified
// 2026-07-06: counts match Mistral's own canonical tokenizer.json exactly (see
// docs/map/tokenizers/backends/tekken.md).
interface TekkenJson {
  config: {
    pattern: string;
    // The file ships more merge tokens than the model actually uses (~150k in
    // file vs a 131072 vocab). Only the first (default_vocab_size -
    // default_num_special_tokens) ranks are real vocab; the rest are padding.
    default_vocab_size: number;
    default_num_special_tokens: number;
  };
  vocab: { rank: number; token_bytes: string }[];
}

/**
 * Builds a js-tiktoken encoder from a cached `tekken.json`. Three details are
 * load-bearing:
 *
 * - **Vocab slice** to `default_vocab_size - default_num_special_tokens` entries.
 *   The file ships ~150k but only those are real vocab; including the padding
 *   ranks lets BPE merge into tokens the real model doesn't have, undercounting.
 *   The slice is what makes counts match Mistral's canonical `tokenizer.json`
 *   (verified, not assumed).
 * - **bpe_ranks format**: js-tiktoken's compact string is one
 *   `_ <rank> <base64>` line per token (the first field is discarded, the second
 *   is the rank offset). `token_bytes` is already base64, exactly what that
 *   format consumes.
 * - **Ranks go in 0-based as-is**, and `special_tokens` is left empty. The real
 *   model offsets token ids past its special tokens, but a token *count* depends
 *   only on relative rank order. Encoding uses empty special lists (via
 *   `createTiktokenEncoder`), matching every backend's never-throw contract:
 *   special-token-looking substrings in content tokenize as ordinary text.
 */
export function loadTekkenEncoder(tekkenJsonPath: string): TokenizerEncoder {
  const { config, vocab } = readJsonFile<TekkenJson>(tekkenJsonPath);
  const inner = config.default_vocab_size - config.default_num_special_tokens;
  const bpe_ranks = vocab
    .slice(0, inner)
    .map((v) => `_ ${v.rank} ${v.token_bytes}`)
    .join('\n');
  const encoding = new Tiktoken({ pat_str: config.pattern, special_tokens: {}, bpe_ranks });
  return createTiktokenEncoder(encoding);
}
