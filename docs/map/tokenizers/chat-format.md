# src/tokenizers/chat-format.ts - Shared Chat-Overhead Formula

<!-- BEGIN GENERATED MAP INTENT -->
## Role

The message/content-stringification and overhead-arithmetic logic every tokenizer backend shares — a fixed per-message and per-request overhead plus whatever `encodeText` function the caller supplies. Extracted from `fallback-estimate.ts` in Phase 2 so the new tiktoken backend (and future HF/SentencePiece/Tekken backends) reuse the same formula instead of duplicating it per encoder.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
TOKENS_PER_MESSAGE_OVERHEAD: 4

TOKENS_PER_REQUEST_OVERHEAD: 2

/**
 * Handles plain strings, arrays, `{ text }` / `{ content }` parts, and a JSON fallback for anything else.
 */
stringifyMessageContent(value: unknown): string

countMessageTokens(message: CoreMessage, encodeText: (text: string) => number): number

/**
 * Parameterized over `encodeText` rather than hardwired to one encoder, so any
 * backend that can turn text into a token count builds a `TokenizerEncoder` on
 * top of this and `countMessageTokens`.
 */
countContextTokens(messages: CoreMessage[], encodeText: (text: string) => number): number
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`agent/system-prompt.ts`](../agent/system-prompt.md) ×1
- **Imported by:** [`tokenizers/fallback-estimate.ts`](fallback-estimate.md) ×2, [`tokenizers/backends/bpe-json.ts`](backends/bpe-json.md) ×1, [`tokenizers/backends/tiktoken.ts`](backends/tiktoken.md) ×1

## Tests

`tests/tokenizers/chat-format.test.ts`.

## Budget

47 / 500 lines (453 to spare).
<!-- END GENERATED MAP FACTS -->

## Used By

- [fallback-estimate.md](fallback-estimate.md): its `estimateContextTokens`/`estimateMessageTokens` are now thin wrappers over these, bound to the fallback encoder.
- [backends/tiktoken.md](backends/tiktoken.md): `createTiktokenEncoder` binds these to a real `js-tiktoken` encoding.
- [backends/bpe-json.md](backends/bpe-json.md): `loadBpeJsonEncoder` binds these to a real `@huggingface/tokenizers` BPE encoding.

## Update Triggers

Any new tokenizer backend (HF `tokenizer.json`, SentencePiece, Tekken) should build its `TokenizerEncoder` on top of `countContextTokens` rather than re-deriving the overhead formula, unless that family's real chat-template overhead needs to diverge from the flat constants here — see `backends/tiktoken.ts`'s caveat comment for why that divergence hasn't been tackled yet even where the model's real format differs.
