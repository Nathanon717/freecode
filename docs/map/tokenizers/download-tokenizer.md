# src/tokenizers/download-tokenizer.ts - HF Tokenizer File Cache/Download

**Role:** Ensures a canonical HF repo file is cached under `.freecode/tokenizers/<family>/<filename>`, downloading it if missing. The HF-fast families use the default `tokenizer.json`; the Tekken family passes `tekken.json`. Mirrors `eval/humaneval-data.ts`'s injectable-`downloadFn` shape for testability.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
downloadFile(url: string, dest: string): Promise<void>

tokenizerCachePath(family: string, filename?: string): string

ensureTokenizerFile(family: string, repoId: string, filename?: string, downloadFn?: (url: string, dest: string) => Promise<void>): Promise<string | null>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`tokenizers/model-family.ts`](model-family.md) ×2, [`providers/model-data.ts`](../providers/model-data.md) ×1
- **Imported by:** [`tokenizers/count.ts`](count.md) ×2

## Tests

`tests/tokenizers/download-tokenizer.test.ts`. 1 other test file references it.

## Budget

89 / 500 lines (411 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `tokenizerCachePath`: keyed by **family** + `filename` (default `tokenizer.json`), not repo ID or model ID — mirrors `count.ts`'s `encoderCache` key, since (so far) one family maps to exactly one canonical repo. The `filename` lets Tekken cache `tekken.json` beside the default without collision.
- `ensureTokenizerFile`: `(family, repoId, filename?, downloadFn?)`. Returns the cached path only if it already exists **and is non-empty** (a 0-byte leftover from a failed download is treated as absent and re-fetched — see `docs/bug log/05-07-2026.md`); otherwise downloads from `https://huggingface.co/<repoId>/resolve/main/<filename>`. Downloads land on a sibling `<dest>.download` temp and are promoted onto `dest` via atomic `rename` only after a non-empty check, so `dest` is only ever a complete file. Never throws — a failed/empty download removes the temp and returns `null`, which `count.ts` treats the same as an unresolved family (fallback estimate).
- `downloadFile`: plain HTTPS GET with redirect-following, same shape as `humaneval-data.ts`'s `downloadFile`. Follows the full redirect family (301/302/303/307/308) and resolves **relative** `Location` headers against the current URL — HF's CDN redirect is a 307 to a relative `/api/resolve-cache/...` path, and following only 301/302 (or treating the relative path as absolute) is what left the 0-byte files. Removes its partial output on any failure. Not shared with `humaneval-data.ts` on purpose — this one has no gzip/JSONL concerns, and cross-module reuse would couple `tokenizers/` to `eval/` for a small helper.

## Key Neighbors

- [backends/bpe-json.md](backends/bpe-json.md): the consumer of the cached `tokenizer.json` path this module produces.
- [backends/tekken.md](backends/tekken.md): the consumer of the cached `tekken.json` path (fetched via the `filename` parameter).
- [count.md](count.md): calls `ensureTokenizerFile` from `preloadTokenizerFor` before loading the encoder.
- `src/eval/humaneval-data.ts`: the pattern this mirrors (injectable `downloadFn`, "ensure" naming), not a shared dependency.

## Update Triggers

If a family ever needs more than one file from the same repo (e.g. `tokenizer_config.json`), extend `ensureTokenizerFile` rather than adding a second parallel download path — but see `backends/bpe-json.md`'s notes on why `tokenizer_config.json` is deliberately never fetched for the BPE families this backend currently serves.
