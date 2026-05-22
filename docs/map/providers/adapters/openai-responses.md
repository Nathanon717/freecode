# src/providers/adapters/openai-responses.ts - Direct OpenAI Responses Adapter

**Role:** Builds and sends OpenAI Responses API payloads for the first-party `openai` provider, including exact input-token preflight counting and direct generation with Freecode tools.

## Exports

- `buildOpenAIResponsesPayload(options)` - converts system prompt, CoreMessage history, model ID, and Freecode tools into a stateless Responses request body.
- `hashOpenAIResponsesPayload(payload)` - stable SHA-256 hash for count-cache keys.
- `getOpenAIApiKey(provider)` - resolves the OpenAI key from env/config.
- `countOpenAIResponsesInputTokens(provider, payload, signal?)` - calls `POST /v1/responses/input_tokens` and parses `input_tokens`.
- `generateOpenAIResponses(provider, payload, tools, confirmToolCall?)` - calls `POST /v1/responses`, executes function calls, and loops up to 10 tool steps.

## Read When

- Changing direct OpenAI request payload shape, input-token counting, tool schema conversion, or Responses tool-loop behavior.
- Debugging OpenAI usage capture after moving first-party OpenAI off the AI SDK Chat Completions path.

## Behavior

- Uses `instructions` for the Freecode system prompt and `store: false` for stateless generation requests.
- Omits `store` from `/responses/input_tokens` requests because the count endpoint rejects that field.
- Converts text CoreMessages to Responses input message items and function outputs to `function_call_output` items.
- Exposes Freecode tools as Responses `function` tools with JSON schemas matching the existing tool parameters.
- Strips transient response item IDs before replaying function-call items in stateless tool loops.
- Captures raw OpenAI usage from JSON responses for downstream display and cost estimation.

## Key Neighbors

- [openai-compat.md](openai-compat.md): remains the adapter for OpenAI-compatible providers such as Groq, OpenRouter, Mistral, and Cerebras.
- [../../agent/loop.md](../../agent/loop.md): uses direct Responses generation for provider `openai`.
- [../../cli/preflight-input-cost.md](../../cli/preflight-input-cost.md): uses the shared payload builder and input-token endpoint for live preflight counts.

## Update Triggers

Update this page when the Responses payload, count endpoint parsing, tool schema mapping, generation loop, or usage capture changes.
