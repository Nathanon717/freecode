# src/tokenizers/backends/bpe-json.ts - HF Fast-Tokenizer (tokenizer.json) Backend

**Role:** Loads a cached HF `tokenizer.json` into a real BPE `TokenizerEncoder` via `@huggingface/tokenizers`. Backs the Llama 3.x, DeepSeek V3/V4, and GLM-4.5-4.7 families registered in `model-family.ts`'s `HF_TOKENIZER_REPO`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
loadBpeJsonEncoder(tokenizerJsonPath: string): TokenizerEncoder
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `loadBpeJsonEncoder`: reads and `JSON.parse`s the file, then constructs `new Tokenizer(json, {})` — the empty second argument stands in for `tokenizer_config.json`, which this backend never fetches. Verified against `@huggingface/tokenizers`' own source: the library builds `normalizer`/`pre_tokenizer`/`model`/`decoder` directly off `tokenizer.json`'s own top-level fields, and for BPE-type models (every family this backend serves) the config argument is read nowhere in the constructor. This sidesteps DeepSeek's real `tokenizer_config.json` bug (`"tokenizer_class": "LlamaTokenizerFast"` installing a Metaspace pre-tokenizer that drops spaces — huggingface/transformers#45488) by construction, not by special-casing DeepSeek.
- Encodes with `add_special_tokens: false` for every call, matching the tiktoken backend's `encode(text, [], [])` discipline — keeps per-message overhead consistent across backends via `chat-format.ts`'s shared constant instead of double-counting a model's real BOS/EOS injection.

## Read When

- Adding a new HF-fast-tokenizer family: add its predicate + canonical repo ID to `model-family.ts`'s `HF_TOKENIZER_REPO`, not here — this file is family-agnostic.

## Key Neighbors

- [../chat-format.md](../chat-format.md): supplies the shared overhead formula this backend builds `TokenizerEncoder` on top of.
- [../download-tokenizer.md](../download-tokenizer.md): supplies the cached file path this backend reads.
- [../count.md](../count.md): calls `loadBpeJsonEncoder` from `preloadTokenizerFor` once `download-tokenizer.ts` confirms the file is cached.
- [../model-family.md](../model-family.md): owns the family→repo-ID mapping and the verification trail for why each canonical repo was chosen.

## Update Triggers

If a future family's `tokenizer.json` uses a non-BPE model type (WordPiece/Unigram), re-check whether the `{}` config shortcut still holds — `create_tokenizer_model` in the library *does* read config fields (`eos_token`, etc.) for Unigram and Legacy model types.
