# src/providers/adapters/openai-compat-request.ts - OpenAI-Compatible Request Transforms

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Pure request-body transforms for OpenAI-compatible providers — no provider state, no network. Mirrors [openai-compat-sse](openai-compat-sse.md) on the response side. Called from quirk profiles in [openai-compat-quirks](openai-compat-quirks.md).

## Read When

Adding or changing a request-body transform for any OpenAI-compatible provider. The entry point is the provider's `transformRequest` hook in `openai-compat-quirks.ts`; `injectParallelToolCallsFalse` is called directly by the adapter skeleton.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
stripTemperatureIfDisallowed(body: Record<string, unknown>): Record<string, unknown>

stripStreamForNonStream(body: Record<string, unknown>): { body: Record<string, unknown>; forcedNonStream: boolean; }

injectCodestralSystem(body: Record<string, unknown>): Record<string, unknown>

/**
 * Give every assistant message that carries `tool_calls` a `reasoning_content`
 * field, so a thinking model's own tool call is legal to send back to it.
 *
 * DeepSeek's API rejects a continuation whose assistant `tool_calls` message has
 * no `reasoning_content` — "The `reasoning_content` in the thinking mode must be
 * passed back to the API" (HTTP 400). The AI SDK never surfaces the field in the
 * first place: `reasoning_content` deltas are dropped while parsing the response
 * stream, so nothing downstream can put it back. The check is on *presence*, not
 * on the text, which is why an empty string satisfies it — verified against
 * `zen:big-pickle`, which fails 100% without the field and passes 100% with it.
 *
 * Assistant messages with only text are exempt: they are accepted without the
 * field, so this adds nothing to them.
 *
 * See `docs/bug log/06-08-2026.md`.
 */
ensureAssistantReasoningContent(body: Record<string, unknown>): Record<string, unknown>

injectParallelToolCallsFalse(body: Record<string, unknown>): Record<string, unknown>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/model-quirks.ts`](../model-quirks.md) ×3
- **Imported by:** [`providers/adapters/openai-compat-quirks.ts`](openai-compat-quirks.md) ×4, [`providers/adapters/openai-compat.ts`](openai-compat.md) ×1

## Tests

`tests/providers/adapters/openai-compat-request.test.ts`.

## Budget

69 / 500 lines (431 to spare).
<!-- END GENERATED MAP FACTS -->

## Key Neighbors

- [model-quirks](../model-quirks.md) — predicates (`openAIModelDisallowsTemperature`, `mistralCodestralRequiresSystemInjection`) used here
- [openai-compat-quirks](openai-compat-quirks.md) — consumer: wires these transforms into per-provider profiles
- [openai-compat](openai-compat.md) — consumer: calls `injectParallelToolCallsFalse` directly (runtime toggle, not a profile entry)
