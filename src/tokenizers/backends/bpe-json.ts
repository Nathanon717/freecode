/**
 * @role Loads a cached HF `tokenizer.json` into a real BPE `TokenizerEncoder` via `@huggingface/tokenizers`. Backs the Llama 3.x, DeepSeek V3/V4, and GLM-4.5-4.7 families registered in `model-family.ts`'s `HF_TOKENIZER_REPO`.
 *
 * @readwhen
 * - Adding a new HF-fast-tokenizer family: add its predicate + canonical repo ID to `model-family.ts`'s `HF_TOKENIZER_REPO`, not here — this file is family-agnostic.
 */

import type { CoreMessage } from 'ai';
import { Tokenizer } from '@huggingface/tokenizers';
import { countContextTokens } from '../chat-format.js';
import type { TokenizerEncoder } from '../count.js';
import { readJsonFile } from '../../util/text-encoding.js';

// Loads a cached tokenizer.json into a real HF fast-tokenizer (BPE) encoder.
// Passes {} as the tokenizer_config.json argument: @huggingface/tokenizers
// builds the normalizer/pre_tokenizer/model/decoder directly off tokenizer.json's
// own fields and never consults a "tokenizer_class" auto-detect step, so this
// sidesteps DeepSeek's tokenizer_config.json Metaspace bug
// (huggingface/transformers#45488) without even needing to fetch
// tokenizer_config.json. Verified against the library's source: for BPE models
// (every family this backend serves), the config argument is unused entirely.
// typescript-eslint's typed lint fails to resolve @huggingface/tokenizers' nested
// "exports" conditions (plain tsc resolves and types it fine) — isolate the
// untyped boundary to one cast, at the local interface below, instead of
// disabling no-unsafe-* rules throughout this file.
interface HfTokenizer {
  encode(text: string, options?: { add_special_tokens?: boolean }): { ids: number[] };
}

export function loadBpeJsonEncoder(tokenizerJsonPath: string): TokenizerEncoder {
  const json = readJsonFile<object>(tokenizerJsonPath);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- see HfTokenizer note above
  const tokenizer = new Tokenizer(json, {}) as HfTokenizer;
  const encodeText = (text: string): number =>
    tokenizer.encode(text, { add_special_tokens: false }).ids.length;
  return {
    countMessages: (messages: CoreMessage[]) => countContextTokens(messages, encodeText),
    countText: encodeText,
  };
}
