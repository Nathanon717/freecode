# src/tokenizers/backends/bpe-json.ts - HF Fast-Tokenizer (tokenizer.json) Backend

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Loads a cached HF `tokenizer.json` into a real BPE `TokenizerEncoder` via `@huggingface/tokenizers`. Backs the Llama 3.x, DeepSeek V3/V4, and GLM-4.5-4.7 families registered in `model-family.ts`'s `HF_TOKENIZER_REPO`.

## Read When

- Adding a new HF-fast-tokenizer family: add its predicate + canonical repo ID to `model-family.ts`'s `HF_TOKENIZER_REPO`, not here — this file is family-agnostic.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Reads and `JSON.parse`s the file, then constructs `new Tokenizer(json, {})` —
 * see the note above for why the empty config argument is safe. Encodes with
 * `add_special_tokens: false` on every call, matching the tiktoken backend's
 * `encode(text, [], [])` discipline: per-message overhead stays consistent across
 * backends via `chat-format.ts`'s shared constant, instead of double-counting a
 * model's real BOS/EOS injection.
 */
loadBpeJsonEncoder(tokenizerJsonPath: string): TokenizerEncoder
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`tokenizers/chat-format.ts`](../chat-format.md) ×1, [`tokenizers/count.ts`](../count.md) ×1, [`util/text-encoding.ts`](../../util/text-encoding.md) ×1
- **Imported by:** [`tokenizers/count.ts`](../count.md) ×1

## Tests

`tests/tokenizers/backends/bpe-json.test.ts`.

## Budget

41 / 500 lines (459 to spare).
<!-- END GENERATED MAP FACTS -->

## Key Neighbors

- [../chat-format.md](../chat-format.md): supplies the shared overhead formula this backend builds `TokenizerEncoder` on top of.
- [../download-tokenizer.md](../download-tokenizer.md): supplies the cached file path this backend reads.
- [../count.md](../count.md): calls `loadBpeJsonEncoder` from `preloadTokenizerFor` once `download-tokenizer.ts` confirms the file is cached.
- [../model-family.md](../model-family.md): owns the family→repo-ID mapping and the verification trail for why each canonical repo was chosen.

## Update Triggers

If a future family's `tokenizer.json` uses a non-BPE model type (WordPiece/Unigram), re-check whether the `{}` config shortcut still holds — `create_tokenizer_model` in the library *does* read config fields (`eos_token`, etc.) for Unigram and Legacy model types.
