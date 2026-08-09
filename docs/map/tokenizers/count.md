# src/tokenizers/count.ts - Tokenizer Engine Public Surface

**Role:** The engine's public entry point: a synchronous `countTokens` safe to call on a hot path (e.g. once per keystroke), backed by an in-memory encoder cache keyed by family, plus an async `preloadTokenizerFor` that compiles and caches exact backends in the background (GPT-OSS bundled since Phase 2; Llama 3.x/DeepSeek V3+V4/GLM-4.5-4.7 downloaded-and-cached since Phase 3; modern Mistral Tekken since Phase 4). `commands/model.ts` reads the synchronous `hasExactTokenizer` capability check to badge picker rows. `cli/session-modes.ts` is the live consumer of the encoder cache: it calls `preloadTokenizerFor` when the active model changes and `countTextTokens` to show the tool-approval preview's "+N tokens" count. The footer `ctx` slot deliberately does **not** use this engine: it shows the provider's own reported `prompt_tokens` (measured, cache-inclusive on most providers) rather than a local estimate that would systematically undercount — see `cli/chrome/footer-status.ts`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface TokenizerEncoder {
  countMessages(messages: CoreMessage[]): number;
  /** Token count for a bare string, with no chat/system-prompt overhead. */
  countText(text: string): number;
}

interface TokenCount {
  tokens: number;
  /** true when an exact encoder produced the count; false for the generic estimate. */
  exact: boolean;
}

countTokens(messages: CoreMessage[], modelId: string): number

countTextTokens(text: string, modelId: string): TokenCount

hasExactTokenizer(modelId: string): boolean

preloadTokenizerFor(modelId: string): Promise<void>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`tokenizers/model-family.ts`](model-family.md) ×13, [`tokenizers/download-tokenizer.ts`](download-tokenizer.md) ×2, [`tokenizers/fallback-estimate.ts`](fallback-estimate.md) ×2, [`tokenizers/backends/bpe-json.ts`](backends/bpe-json.md) ×1, [`tokenizers/backends/tekken.ts`](backends/tekken.md) ×1, [`tokenizers/backends/tiktoken.ts`](backends/tiktoken.md) ×1
- **Imported by:** [`cli/tools/tool-approval.ts`](../cli/tools/tool-approval.md) ×7, [`cli/session-modes.ts`](../cli/session-modes.md) ×3, [`tokenizers/backends/tiktoken.ts`](backends/tiktoken.md) ×3, [`commands/model.ts`](../commands/model.md) ×1, [`tokenizers/backends/bpe-json.ts`](backends/bpe-json.md) ×1, [`tokenizers/backends/tekken.ts`](backends/tekken.md) ×1

## Tests

`tests/tokenizers/count.test.ts`. 1 other test file references it.

## Budget

108 / 500 lines (392 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `countTokens`: resolves the model's family, looks it up in the in-memory `encoderCache` (keyed by family, not model ID, since many model IDs share one family), and falls back to `fallback-estimate.ts`'s generic tiktoken estimate when no family is resolved or no encoder is cached yet. Never blocks, never throws.
- `countTextTokens`: like `countTokens` but for a bare string with no chat/system-prompt overhead (each backend's `countText` calls the encoder's text-encode lambda directly, bypassing `chat-format.ts`'s per-message + per-request + system-prompt padding). Returns `{ tokens, exact }`, where `exact` is true only when a loaded encoder produced the count and false on the generic-estimate fallback — this is the "the number is exact" signal `hasExactTokenizer` deliberately doesn't give. `cli/session-modes.ts` uses it for the approval hint's "+N tokens" / "+N tokens appx" label. Never blocks, never throws.
- `hasExactTokenizer`: synchronous capability check (`resolveTokenizerFamily(modelId) !== null`) for catalog UI — the model-picker eye badge. Deliberately reports whether an exact backend *exists* for the model, not whether an encoder is loaded in `encoderCache`; the picker runs before any preload, so a loaded-state check would almost never fire there. The stricter "the number we're showing is exact" signal lives on `countTextTokens`'s `exact` field instead.
- `preloadTokenizerFor`: resolves the family. For GPT-OSS, registers `backends/tiktoken.ts`'s `getGptOssEncoder()` into `encoderCache` directly (bundled, no download). For the HF fast-tokenizer families (`model-family.ts`'s `HF_TOKENIZER_REPO`), runs `download-tokenizer.ts`'s `ensureTokenizerFile` then `backends/bpe-json.ts`'s `loadBpeJsonEncoder`. For the Mistral Tekken family, `loadTekkenFamily` fetches the repo's `tekken.json` (via `ensureTokenizerFile`'s `filename` argument) then builds the encoder with `backends/tekken.ts`'s `loadTekkenEncoder`. A module-level `pendingLoads` map de-dupes concurrent preload calls for the same family (e.g. rapid model switches before a download finishes) so it isn't kicked off twice. Wrapped in try/catch — a download failure, parse failure, or unmapped family just leaves the cache unset, keeping `countTokens` on the fallback path.

## Key Neighbors

- [model-family.md](model-family.md): family resolution and the family→repo-ID map.
- [fallback-estimate.md](fallback-estimate.md): the always-available fallback path.
- [backends/tiktoken.md](backends/tiktoken.md): the GPT-OSS encoder registered here — also documents why its counts aren't yet numerically different from the fallback.
- [backends/bpe-json.md](backends/bpe-json.md) and [download-tokenizer.md](download-tokenizer.md): the HF fast-tokenizer families' load path.
- [backends/tekken.md](backends/tekken.md): the Mistral Tekken family's load path.

## Update Triggers

When a phase adds an exact tokenizer backend, register its compiled encoder into `encoderCache` from `preloadTokenizerFor` and update this page's notes.
