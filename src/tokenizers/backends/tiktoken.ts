import type { CoreMessage } from 'ai';
import { getEncoding } from 'js-tiktoken';
import { countContextTokens } from '../chat-format.js';
import type { TokenizerEncoder } from '../count.js';

// Wraps a bundled js-tiktoken encoding as a TokenizerEncoder. Shared by every
// tiktoken-based family (starting with GPT-OSS here; Mistral Tekken reuses
// this same wrapper once its vocab/merges are parsed out of tekken.json).
export function createTiktokenEncoder(encoding: ReturnType<typeof getEncoding>): TokenizerEncoder {
  return {
    countMessages(messages: CoreMessage[]): number {
      return countContextTokens(messages, (text) => encoding.encode(text, [], []).length);
    },
  };
}

let gptOssEncoder: TokenizerEncoder | null = null;

// KNOWN INACCURACY: GPT-OSS's real tokenizer is "o200k_harmony", not
// "o200k_base". Verified against openai/tiktoken's own source
// (tiktoken_ext/openai_public.py): o200k_harmony reuses o200k_base's exact
// BPE ranks and only *adds* special tokens for the harmony chat-format
// wrapper (<|start|>role<|message|>content<|end|>, <|channel|>, <|call|>,
// etc). Those specials never come into play here because messages are
// counted as plain text (encode(text, [], []), matching the fallback's
// never-throw contract) — with an empty allowed-special set, js-tiktoken
// scans past any special-token-looking substring and tokenizes it as
// ordinary text regardless of whether it's registered as special. So
// content-BPE token counts here are byte-for-byte exact for GPT-OSS, but the
// per-message overhead below still uses the same flat, generic
// TOKENS_PER_MESSAGE_OVERHEAD constant every other backend uses — it does
// NOT model GPT-OSS's real harmony wrapper tokens. The resulting total is
// therefore only an approximation of GPT-OSS's true context size (currently
// numerically identical to the Phase 1 fallback), not an exact count. Making
// it genuinely exact requires rendering the harmony template and encoding
// its wrapper tokens as real specials, which is out of scope for this phase.
export function getGptOssEncoder(): TokenizerEncoder {
  if (!gptOssEncoder) gptOssEncoder = createTiktokenEncoder(getEncoding('o200k_base'));
  return gptOssEncoder;
}
