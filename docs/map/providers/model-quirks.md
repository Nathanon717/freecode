# src/providers/model-quirks.ts - Per-Model Static Quirks

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Single home for all static per-model capability predicates. Keeps model-ID checks out of the adapter and off the hot path.

## Read When

- Adding a new per-model request-body quirk (wrong temperature range, empty content rejection, unsupported fields, etc.).
- Debugging an adapter patch to understand which models trigger it.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * OpenAI reasoning models (o1, o3, gpt-5) reject any temperature value; strip it entirely.
 */
openAIModelDisallowsTemperature(modelId: string): boolean

/**
 * Mistral Codestral models silently ignore the system role; inject system content into the first user message instead.
 */
mistralCodestralRequiresSystemInjection(modelId: string): boolean

/**
 * Move the system message into the first user message for models that ignore
 * the system role. Removes the system entry and prepends its content to the
 * first user message's content string.
 */
injectSystemIntoFirstUserMessage(messages: Record<string, unknown>[]): Record<string, unknown>[]
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`providers/adapters/openai-compat-request.ts`](adapters/openai-compat-request.md) ×3

## Tests

`tests/providers/model-quirks.test.ts`.

## Budget

31 / 500 lines (469 to spare).
<!-- END GENERATED MAP FACTS -->

## Key Neighbors

- [adapters/openai-compat.md](adapters/openai-compat.md): sole consumer; applies these predicates inside its custom fetch wrapper.
- [model-data.md](model-data.md): runtime-learned per-model traits (e.g. `nativeTools`); complements the static checks here.

## Update Triggers

Add a predicate here whenever a model subset needs different request-body handling than the rest of its provider. Do not add runtime-learned traits here — those belong in `model-data.ts`.
