# src/tokenizers/fallback-estimate.ts - Generic Tiktoken Fallback Estimator

<!-- BEGIN GENERATED MAP INTENT -->
## Role

The permanent fallback token estimator for any model with no exact tokenizer backend — a real `o200k_base` BPE count for the wrong model family, not a chars/4 heuristic. Replaces the deleted `src/agent/token-count.ts`.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
estimateTextTokens(text: string): number

estimateMessageTokens(message: CoreMessage): number

estimateContextTokens(messages: CoreMessage[]): number
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`tokenizers/chat-format.ts`](chat-format.md) ×2
- **Imported by:** [`tokenizers/count.ts`](count.md) ×2

## Tests

`tests/tokenizers/fallback-estimate.test.ts`. 2 other test files reference it.

## Budget

29 / 500 lines (471 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `estimateTextTokens`: lazily creates a single module-level `js-tiktoken` `o200k_base` encoder and returns its real BPE token count.
- `estimateMessageTokens` / `estimateContextTokens`: thin wrappers over [chat-format.md](chat-format.md)'s `countMessageTokens`/`countContextTokens`, bound to `estimateTextTokens`. The overhead formula and content-stringification logic live there now (extracted in Phase 2 so `backends/tiktoken.ts` can reuse them); this file only supplies the `o200k_base` encoder.

## Used By

- [count.md](count.md): `countTokens`'s fallback path when no exact family is resolved or cached.
- [chat-format.md](chat-format.md): supplies the shared overhead formula this file's exports wrap.

## Caveat

This is the wrong model family's tokenizer for anything that isn't OpenAI's `o200k_base` vocab — a real BPE estimate, still not exact billing/provider accounting for non-OpenAI models.
