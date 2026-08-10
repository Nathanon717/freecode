# src/tokenizers/count.ts - Tokenizer Engine Public Surface

<!-- BEGIN GENERATED MAP INTENT -->
## Role

The engine's public entry point: a synchronous `countTokens` safe to call on a hot path (once per keystroke), backed by an in-memory encoder cache keyed by family, plus an async `preloadTokenizerFor` that compiles and caches exact backends in the background.

## Read When

- Changing the synchronous per-keystroke token count or its generic-estimate fallback path.
- Debugging why counts show as approximate, since cache misses fall back to `estimateTextTokens` with `exact: false`.
- Adding a new tokenizer family backend to the `preloadTokenizerFor` ensure-download → load → cache pipeline.
<!-- END GENERATED MAP INTENT -->

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

/**
 * Synchronous so it's safe on a hot path (e.g. once per keystroke). Reads
 * whatever's already in the in-memory cache; never blocks, never throws.
 * Falls back to the generic tiktoken estimate when no family is resolved or
 * no encoder has been compiled for it yet — the only reachable path until a
 * later phase registers an exact backend into encoderCache.
 *
 * The cache is keyed by *family*, not model ID, since many model IDs share one
 * family.
 */
countTokens(messages: CoreMessage[], modelId: string): number

/**
 * Count the tokens a bare string contributes on its own (no chat or
 * system-prompt overhead), using the model's exact encoder when one is loaded
 * and the generic estimate otherwise. `exact` reports which path ran so callers
 * can flag an estimate as approximate. Synchronous, never throws — same hot-path
 * contract as countTokens.
 *
 * `cli/session-modes.ts` uses it for the approval hint's `+N tokens` /
 * `+N tokens appx` label.
 */
countTextTokens(text: string, modelId: string): TokenCount

/**
 * Does an exact tokenizer backend *exist* for this model? Capability check for
 * catalog UI (the model-picker badge) — not whether an encoder is loaded yet.
 *
 * The picker runs before any preload, so a loaded-state check would almost never
 * fire there. The stricter "the number we're showing is exact" signal lives on
 * `countTextTokens`'s `exact` field instead.
 */
hasExactTokenizer(modelId: string): boolean

/**
 * Resolves the family and compiles/caches its encoder in the background so
 * countTokens can read it synchronously on the next call. GPT-OSS resolves
 * immediately (bundled); the HF fast-tokenizer families (Llama 3.x, DeepSeek
 * V3/V4, GLM-4.5-4.7) and the modern Mistral Tekken family go through
 * ensure-download → load → cache over the network. Never
 * throws — an unresolved family or a download/build failure just leaves
 * encoderCache unset, which keeps countTokens on the fallback path.
 *
 * A module-level `pendingLoads` map de-dupes concurrent preload calls for the
 * same family, so a rapid model switch cannot kick the same download off twice.
 */
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

129 / 500 lines (371 to spare).
<!-- END GENERATED MAP FACTS -->

## Notes

An exact tokenizer backend registers its compiled encoder into `encoderCache` from
`preloadTokenizerFor`.

Exact backends by phase: GPT-OSS bundled (phase 2); Llama 3.x, DeepSeek V3+V4 and
GLM-4.5–4.7 downloaded and cached (phase 3); modern Mistral Tekken (phase 4).

`commands/model.ts` reads the synchronous `hasExactTokenizer` capability check to badge
picker rows. `cli/session-modes.ts` is the live consumer of the encoder cache: it calls
`preloadTokenizerFor` when the active model changes, and `countTextTokens` for the
tool-approval preview's "+N tokens" count.

The footer `ctx` slot deliberately does **not** use this engine. It shows the provider's
own reported `prompt_tokens` — measured, and cache-inclusive on most providers — rather
than a local estimate that would systematically undercount. See
[../cli/chrome/footer-status.md](../cli/chrome/footer-status.md).
