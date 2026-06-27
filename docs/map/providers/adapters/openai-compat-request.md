# src/providers/adapters/openai-compat-request.ts - OpenAI-Compatible Request Transforms

**Role:** Pure request-body transforms for OpenAI-compatible providers — no provider state, no network. Mirrors [openai-compat-sse](openai-compat-sse.md) on the response side. Called from quirk profiles in [openai-compat-quirks](openai-compat-quirks.md).

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
stripTemperatureIfDisallowed(body: Record<string, unknown>): Record<string, unknown>

stripStreamForNonStream(body: Record<string, unknown>): { body: Record<string, unknown>; forcedNonStream: boolean; }

injectCodestralSystem(body: Record<string, unknown>): Record<string, unknown>

injectParallelToolCallsFalse(body: Record<string, unknown>): Record<string, unknown>
```
<!-- END GENERATED EXPORTS -->

## Read When

Adding or changing a request-body transform for any OpenAI-compatible provider. The entry point is the provider's `transformRequest` hook in `openai-compat-quirks.ts`; `injectParallelToolCallsFalse` is called directly by the adapter skeleton.

## Key Neighbors

- [model-quirks](../model-quirks.md) — predicates (`openAIModelDisallowsTemperature`, `mistralCodestralRequiresSystemInjection`) used here
- [openai-compat-quirks](openai-compat-quirks.md) — consumer: wires these transforms into per-provider profiles
- [openai-compat](openai-compat.md) — consumer: calls `injectParallelToolCallsFalse` directly (runtime toggle, not a profile entry)
