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
  return {
    countMessages(messages: CoreMessage[]): number {
      return countContextTokens(
        messages,
        (text) => tokenizer.encode(text, { add_special_tokens: false }).ids.length,
      );
    },
  };
}
