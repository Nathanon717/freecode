# src/providers/model-quirks.ts - Per-Model Static Quirks

**Role:** Single home for all static per-model capability predicates. Keeps model-ID checks out of the adapter and off the hot path.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
openAIModelDisallowsTemperature(modelId: string): boolean

mistralCodestralRequiresSystemInjection(modelId: string): boolean

injectSystemIntoFirstUserMessage(messages: Record<string, unknown>[]): Record<string, unknown>[]
```
<!-- END GENERATED EXPORTS -->

## Read When

- Adding a new per-model request-body quirk (wrong temperature range, empty content rejection, unsupported fields, etc.).
- Debugging an adapter patch to understand which models trigger it.

## Key Neighbors

- [adapters/openai-compat.md](adapters/openai-compat.md): sole consumer; applies these predicates inside its custom fetch wrapper.
- [model-store.md](model-store.md): runtime-learned per-model traits (e.g. `nativeTools`); complements the static checks here.

## Update Triggers

Add a predicate here whenever a model subset needs different request-body handling than the rest of its provider. Do not add runtime-learned traits here — those belong in `model-store.ts`.
