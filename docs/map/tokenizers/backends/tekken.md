# src/tokenizers/backends/tekken.ts - Mistral Tekken (tekken.json) Backend

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Loads a cached Mistral `tekken.json` into a `js-tiktoken` `TokenizerEncoder`. Backs the modern Mistral line (NeMo-era and newer) registered as `MISTRAL_TEKKEN_FAMILY` in `model-family.ts`. Tekken is a tiktoken-based byte-BPE tokenizer in a non-standard file layout, so this reuses `tiktoken.ts`'s `createTiktokenEncoder` rather than a separate engine.

## Read When

- Adding another Tekken-era Mistral model: extend the `isMistralTekken` predicate in `model-family.ts`, not here — this file is family-agnostic and one canonical repo covers the whole line.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
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
loadTekkenEncoder(tekkenJsonPath: string): TokenizerEncoder
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`tokenizers/backends/tiktoken.ts`](tiktoken.md) ×1, [`tokenizers/count.ts`](../count.md) ×1, [`util/text-encoding.ts`](../../util/text-encoding.md) ×1
- **Imported by:** [`tokenizers/count.ts`](../count.md) ×1

## Tests

`tests/tokenizers/backends/tekken.test.ts`.

## Budget

52 / 500 lines (448 to spare).
<!-- END GENERATED MAP FACTS -->

## Key Neighbors

- [tiktoken.md](tiktoken.md): supplies `createTiktokenEncoder`, the shared `Tiktoken → TokenizerEncoder` wrapper this backend feeds its constructed encoding into.
- [../download-tokenizer.md](../download-tokenizer.md): fetches/caches `tekken.json` (via its `filename` parameter) — the cached path this backend reads.
- [../count.md](../count.md): calls `loadTekkenEncoder` from `preloadTokenizerFor`'s Tekken branch once the file is cached.
- [../model-family.md](../model-family.md): owns `MISTRAL_TEKKEN_FAMILY`, `MISTRAL_TEKKEN_REPO`, `TEKKEN_FILENAME`, and the `isMistralTekken` predicate.

## Update Triggers

If a future Mistral generation retrains the byte-BPE vocab (not just the special-token set), the "one repo covers the line" assumption breaks — split the family and add a second canonical repo, re-verifying that the used-vocab hash matches before widening the predicate.
