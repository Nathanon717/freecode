# src/providers/adapters/openai-compat-sse.ts - OpenAI-Compatible SSE Transforms

**Role:** Pure request/response body transforms used by the OpenAI-compatible adapter. No provider state and no network — just functions over SSE/JSON strings and `Response` bodies.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
normalizeOpenAICompatToolCallSse(body: string): string

mistralJsonToSse(json: unknown): string

normalizeOpenAICompatToolCallResponse(response: Response): Response
```
<!-- END GENERATED EXPORTS -->

## `normalizeOpenAICompatToolCallSse`

Rewrites streamed `data:` chunks, adding a missing `type: "function"` on `delta.tool_calls[]` entries so the OpenAI SDK stream parser accepts otherwise-compatible function-call deltas from providers such as Mistral and LLM7. Non-`data:` parts and `[DONE]` are passed through unchanged.

## `mistralJsonToSse`

Converts a non-streaming OpenAI-compatible JSON completion into `chat.completion.chunk` SSE. Mistral only returns `x-ratelimit-*` headers on non-streaming responses, so the adapter strips `stream:true`, then synthesizes SSE here to keep the rest of the pipeline (AI SDK, normalizer, usage capture) unchanged. Emits a role/content (or tool-call) delta, a finish-reason chunk, an optional usage chunk, and a terminating `[DONE]`.

## `normalizeOpenAICompatToolCallResponse`

Wraps a streaming response so each complete SSE line passes through `normalizeOpenAICompatToolCallSse`, buffering partial lines across chunks. Non-OK or non-`text/event-stream` responses are returned untouched.

## Read When

Changing how OpenAI-compatible stream/JSON bodies are normalized, or adding a new provider quirk that requires reshaping the response body.
