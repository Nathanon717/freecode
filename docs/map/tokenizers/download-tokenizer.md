# src/tokenizers/download-tokenizer.ts - HF Tokenizer File Cache/Download

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Ensures a canonical HF repo file is cached under `.freecode/tokenizers/<family>/<filename>`, downloading it if missing. The HF-fast families use the default `tokenizer.json`; the Tekken family passes `tekken.json`. Mirrors `eval/humaneval-data.ts`'s injectable-`downloadFn` shape for testability.

## Read When

- Adding a new tokenizer family that fetches a non-default repo file, like Tekken's `tekken.json`.
- Debugging failed tokenizer downloads that leave 0-byte cache entries or reject on 307 redirects.
- Changing the `.freecode/tokenizers/<family>/<filename>` cache layout to match count.ts's encoderCache keying.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Plain HTTPS GET with redirect following. Follows the full redirect family
 * (301/302/303/307/308) and resolves **relative** `Location` headers against the
 * current URL — HF's CDN redirect is a 307 to a relative `/api/resolve-cache/…`
 * path, and following only 301/302 (or treating the relative path as absolute) is
 * what left the 0-byte files. Removes its partial output on any failure.
 *
 * Deliberately not shared with `eval/humaneval-data.ts`'s `downloadFile`: this one
 * has no gzip/JSONL concerns, and reuse would couple `tokenizers/` to `eval/` for
 * a small helper.
 */
downloadFile(url: string, dest: string): Promise<void>

/**
 * Cache path is keyed by family (not repo ID or model ID) to match
 * count.ts's encoderCache key — one family currently maps to one canonical repo.
 * `filename` is the HF repo file to fetch/store: the HF-fast families use the
 * default `tokenizer.json`; the Tekken family passes `tekken.json` (a different
 * file in the same repo layout), so it caches beside it without collision.
 */
tokenizerCachePath(family: string, filename?: string): string

/**
 * Downloads a canonical HF repo file if not already cached under
 * .freecode/tokenizers/<family>/<filename>. Returns the cached path, or
 * null (never throws) if the download fails — callers fall back to the
 * generic estimate on null.
 *
 * The cached path counts only if it exists **and is non-empty**: a 0-byte
 * leftover from a failed download is treated as absent and re-fetched
 * (`docs/bug log/05-07-2026.md`). Downloads land on a sibling `<dest>.download`
 * temp and are promoted onto `dest` by atomic `rename` only after a non-empty
 * check, so `dest` is only ever a complete file. A failed or empty download
 * removes the temp and returns null, which `count.ts` treats the same as an
 * unresolved family.
 */
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

112 / 500 lines (388 to spare).
<!-- END GENERATED MAP FACTS -->

## Notes

A family that needs more than one file from the same repo (say `tokenizer_config.json`)
extends `ensureTokenizerFile` rather than adding a second parallel download path — but see
[backends/bpe-json.md](backends/bpe-json.md) for why `tokenizer_config.json` is
deliberately never fetched for the BPE families this serves.
