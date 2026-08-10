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

## Notes

The `{}` config shortcut holds only for BPE model types. `create_tokenizer_model` in the
library *does* read config fields (`eos_token`, and others) for Unigram and Legacy types,
so a family whose `tokenizer.json` is not BPE needs that re-checked.
