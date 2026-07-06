# src/tokenizers/backends/tekken.ts - Mistral Tekken (tekken.json) Backend

**Role:** Loads a cached Mistral `tekken.json` into a `js-tiktoken` `TokenizerEncoder`. Backs the modern Mistral line (NeMo-era and newer) registered as `MISTRAL_TEKKEN_FAMILY` in `model-family.ts`. Tekken is a tiktoken-based byte-BPE tokenizer in a non-standard file layout, so this reuses `tiktoken.ts`'s `createTiktokenEncoder` rather than a separate engine.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
loadTekkenEncoder(tekkenJsonPath: string): TokenizerEncoder
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `loadTekkenEncoder`: reads `{ config, vocab }`, then builds a `js-tiktoken` `Tiktoken` directly — no `mistral-common` preprocessing. Three details are load-bearing:
  - **Vocab slice:** only the first `config.default_vocab_size - config.default_num_special_tokens` (= 130072 for the current line) entries are the real vocab; the file ships ~150k, the rest are padding. Including the padding lets BPE merge into tokens the real model doesn't have, undercounting. The slice is what makes counts match Mistral's canonical `tokenizer.json` (verified 2026-07-06, not assumed — see `docs/plans/tokenizer-registry-plan.md` Phase 4).
  - **bpe_ranks format:** js-tiktoken's compact ranks string is `<ignored> <offset> <base64tok>…` per line; this emits one `_ <rank> <token_bytes>` line per token. `token_bytes` is already base64, exactly what that format consumes.
  - **Ranks 0-based, `pat_str` = `config.pattern`, empty `special_tokens`:** the real model offsets token ids past its special tokens, but a token *count* only depends on relative rank order, so ranks go in as-is. Encoding uses empty special lists (via `createTiktokenEncoder`), matching every backend's never-throw contract.

## Read When

- Adding another Tekken-era Mistral model: extend the `isMistralTekken` predicate in `model-family.ts`, not here — this file is family-agnostic and one canonical repo covers the whole line.

## Key Neighbors

- [tiktoken.md](tiktoken.md): supplies `createTiktokenEncoder`, the shared `Tiktoken → TokenizerEncoder` wrapper this backend feeds its constructed encoding into.
- [../download-tokenizer.md](../download-tokenizer.md): fetches/caches `tekken.json` (via its `filename` parameter) — the cached path this backend reads.
- [../count.md](../count.md): calls `loadTekkenEncoder` from `preloadTokenizerFor`'s Tekken branch once the file is cached.
- [../model-family.md](../model-family.md): owns `MISTRAL_TEKKEN_FAMILY`, `MISTRAL_TEKKEN_REPO`, `TEKKEN_FILENAME`, and the `isMistralTekken` predicate.

## Update Triggers

If a future Mistral generation retrains the byte-BPE vocab (not just the special-token set), the "one repo covers the line" assumption breaks — split the family and add a second canonical repo, re-verifying the used-vocab hash matches as Phase 4 did.
