# src/tokenizers/fallback-estimate.ts - Generic Tiktoken Fallback Estimator

<!-- BEGIN GENERATED MAP INTENT -->
## Role

The permanent fallback token estimator for any model with no exact tokenizer backend — a real `o200k_base` BPE count for the wrong model family, not a chars/4 heuristic. Replaces the deleted `src/agent/token-count.ts`.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Real BPE token count for the wrong model family — the permanent fallback
 * for any model with no exact tokenizer backend, not a stopgap. Special-token
 * strings (e.g. "<|endoftext|>") are encoded as ordinary text via empty
 * allowed/disallowed-special lists: js-tiktoken throws on them by default,
 * but a real chat request sends user content as plain text too, so this is
 * both the accurate and the non-throwing behavior.
 */
estimateTextTokens(text: string): number

/**
 * Thin wrapper over `chat-format.ts`'s `countMessageTokens`, bound to `estimateTextTokens`.
 */
estimateMessageTokens(message: CoreMessage): number

/**
 * Thin wrapper over `chat-format.ts`'s `countContextTokens`, bound to `estimateTextTokens`.
 */
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

33 / 500 lines (467 to spare).
<!-- END GENERATED MAP FACTS -->

## Caveat

This is the wrong model family's tokenizer for anything that isn't OpenAI's `o200k_base` vocab — a real BPE estimate, still not exact billing/provider accounting for non-OpenAI models.

## Notes

[count.md](count.md)'s `countTokens` uses this whenever no exact family resolves or is
cached, and [chat-format.md](chat-format.md) supplies the shared overhead formula these
exports wrap.
