# src/tokenizers/download-tokenizer.ts - HF Tokenizer File Cache/Download

**Role:** Ensures a canonical HF repo's `tokenizer.json` is cached under `.freecode/tokenizers/<family>/tokenizer.json`, downloading it if missing. Mirrors `eval/humaneval-data.ts`'s injectable-`downloadFn` shape for testability.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
downloadFile(url: string, dest: string): Promise<void>

tokenizerCachePath(family: string): string

ensureTokenizerFile(family: string, repoId: string, downloadFn?: (url: string, dest: string) => Promise<void>): Promise<string | null>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `tokenizerCachePath`: keyed by **family**, not repo ID or model ID — mirrors `count.ts`'s `encoderCache` key, since (so far) one family maps to exactly one canonical repo.
- `ensureTokenizerFile`: returns the cached path immediately if it already exists (no `downloadFn` call); otherwise downloads from `https://huggingface.co/<repoId>/resolve/main/tokenizer.json`. Never throws — a failed download returns `null`, and `count.ts` treats that the same as an unresolved family (fallback estimate).
- `downloadFile`: plain HTTPS GET with redirect-following, same shape as `humaneval-data.ts`'s `downloadFile`. Not shared between the two modules on purpose — this one has no gzip/JSONL concerns, and cross-module reuse would couple `tokenizers/` to `eval/` for a ~15-line helper.

## Key Neighbors

- [backends/bpe-json.md](backends/bpe-json.md): the consumer of the cached path this module produces.
- [count.md](count.md): calls `ensureTokenizerFile` from `preloadTokenizerFor` before loading the encoder.
- `src/eval/humaneval-data.ts`: the pattern this mirrors (injectable `downloadFn`, "ensure" naming), not a shared dependency.

## Update Triggers

If a family ever needs more than one file from the same repo (e.g. `tokenizer_config.json`), extend `ensureTokenizerFile` rather than adding a second parallel download path — but see `backends/bpe-json.md`'s notes on why `tokenizer_config.json` is deliberately never fetched for the BPE families this backend currently serves.
