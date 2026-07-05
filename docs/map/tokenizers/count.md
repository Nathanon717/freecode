# src/tokenizers/count.ts - Tokenizer Engine Public Surface

**Role:** The engine's public entry point: a synchronous `countTokens` safe to call on a hot path (e.g. once per keystroke), backed by an in-memory encoder cache keyed by family, plus an async `preloadTokenizerFor` that compiles and caches exact backends in the background (GPT-OSS bundled since Phase 2; Llama 3.x/DeepSeek V3+V4/GLM-4.5-4.7 downloaded-and-cached since Phase 3). The one interactive consumer so far is `commands/model.ts`, which reads the synchronous `hasExactTokenizer` capability check to badge picker rows; the live-counter follow-up task still owes wiring `preloadTokenizerFor` into the model-change flow and reading `countTokens` from the footer.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface TokenizerEncoder {
  countMessages(messages: CoreMessage[]): number;
}

countTokens(messages: CoreMessage[], modelId: string): number

hasExactTokenizer(modelId: string): boolean

preloadTokenizerFor(modelId: string): Promise<void>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `countTokens`: resolves the model's family, looks it up in the in-memory `encoderCache` (keyed by family, not model ID, since many model IDs share one family), and falls back to `fallback-estimate.ts`'s generic tiktoken estimate when no family is resolved or no encoder is cached yet. Never blocks, never throws.
- `hasExactTokenizer`: synchronous capability check (`resolveTokenizerFamily(modelId) !== null`) for catalog UI — the model-picker eye badge. Deliberately reports whether an exact backend *exists* for the model, not whether an encoder is loaded in `encoderCache`; the picker runs before any preload, so a loaded-state check would almost never fire there. The stricter "the number we're showing is exact" signal stays with the live counter's `countTokens` fallback.
- `preloadTokenizerFor`: resolves the family. For GPT-OSS, registers `backends/tiktoken.ts`'s `getGptOssEncoder()` into `encoderCache` directly (bundled, no download). For the HF fast-tokenizer families (`model-family.ts`'s `HF_TOKENIZER_REPO`), runs `download-tokenizer.ts`'s `ensureTokenizerFile` then `backends/bpe-json.ts`'s `loadBpeJsonEncoder` — the first families in this engine that actually fetch a file over the network rather than resolving synchronously. A module-level `pendingLoads` map de-dupes concurrent preload calls for the same family (e.g. rapid model switches before a download finishes) so it isn't kicked off twice. Wrapped in try/catch — a download failure, parse failure, or unmapped family just leaves the cache unset, keeping `countTokens` on the fallback path.

## Key Neighbors

- [model-family.md](model-family.md): family resolution and the family→repo-ID map.
- [fallback-estimate.md](fallback-estimate.md): the always-available fallback path.
- [backends/tiktoken.md](backends/tiktoken.md): the GPT-OSS encoder registered here — also documents why its counts aren't yet numerically different from the fallback.
- [backends/bpe-json.md](backends/bpe-json.md) and [download-tokenizer.md](download-tokenizer.md): the HF fast-tokenizer families' load path.

## Update Triggers

When a phase adds an exact tokenizer backend, register its compiled encoder into `encoderCache` from `preloadTokenizerFor` and update this page's notes.
