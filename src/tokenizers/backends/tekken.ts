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

// Builds a js-tiktoken encoder from a cached tekken.json.
//
// - Slices vocab to `default_vocab_size - default_num_special_tokens` entries —
//   this boundary is load-bearing: including the padding ranks lets BPE merge
//   into tokens the real model doesn't have, undercounting. The slice is what
//   makes counts match Mistral's canonical tokenizer (verified, not assumed).
// - Emits js-tiktoken's compact bpe_ranks string: one `_ <rank> <base64>` line
//   per token (the first field is discarded, the second is the rank offset).
//   token_bytes is already base64, exactly what that format wants.
// - Ranks go in 0-based as-is: the real model offsets token ids past the special
//   tokens, but a token *count* only depends on relative rank order, not id.
// - special_tokens is left empty and encode() is called with empty special lists
//   (via createTiktokenEncoder), matching every backend's never-throw contract:
//   special-token-looking substrings in content are tokenized as ordinary text.
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
