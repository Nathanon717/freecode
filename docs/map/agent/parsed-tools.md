# src/agent/parsed-tools.ts - Parsed-Tools Harness

**Role:** Fallback agentic loop for models that reject native function calling. Augments the system prompt with a text-based `<tool_call>` protocol and drives a ReAct-style loop by injecting tool results as user messages.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
buildParsedToolsSystemPrompt(base: string): string

parseToolCalls(text: string): ParsedToolCall[]

interface ParsedToolsResult {
  text: string;
  totalTokens: number;
  promptTokens?: number;
  outputTokens?: number;
  /** What this turn added on top of `messages` — see agent/turn-messages.ts. */
  turnMessages: CoreMessage[];
}

executeToolCalls(tools: Record<string, AnyCoreTool>, calls: readonly { name: string; args: Record<string, unknown>; }[], idPrefix: string, messages: CoreMessage[]): Promise<...>

runParsedToolsLoop(messages: CoreMessage[], systemPrompt: string, model: LanguageModelV1, confirmToolCall?: ConfirmToolCall | undefined, toolRationale?: boolean | undefined, readOnly?: boolean | undefined, onStepUsage?: ((promptTokens: number) => void) | undefined): Promise<...>
```
<!-- END GENERATED EXPORTS -->

## Read When

- Understanding the parsed-tools fallback path.
- Changing how tool calls are formatted or parsed in text-only mode.
- Debugging tool execution when the model doesn't support native function calling.

## How It Works

`executeToolCalls` iterates a list of parsed tool calls against a `createTools` map: unknown tools become error strings (fed back to the model), known tools delegate to their wrapped `execute`. It has no try/catch of its own — the wrapper in `tools/index.ts` already turns a failing tool into an `Error: ...` result string, so the only throw that reaches here is a user abort, which must propagate. This helper is used by both `runParsedToolsLoop` (text-based protocol) and `runFakeLlm` in `loop.ts` (fake fixture tool execution).

`runParsedToolsLoop`:
1. Appends a tool-calling protocol section to the system prompt.
2. Calls `streamText` (no native tools) and buffers the full response.
3. Parses `<tool_call>{"name":"...","args":{...}}</tool_call>` blocks.
4. If no calls: prints the response and returns.
5. If calls: prints any text before the first call, calls `executeToolCalls`, injects all results as a `<tool_result>` user message, and loops. The loop is unbounded — step 4 is the only normal exit.

The embedded tool reference must mirror the actual tool schemas; for example `grep` uses `include` for its optional glob filter.

`createTools` is called here **without** a `spawnAgent` runner, so `spawn_agent` does not exist under this protocol and the addendum's tool reference omits it. `loop.ts` therefore passes a prompt built with `buildSystemPrompt(loadAgentsMd, false)`; if `spawn_agent` is ever added here, both the addendum and that flag have to change together.

## Turn messages

`streamText` is called here **without a `tools` parameter**. That makes a native `role: 'tool'` message left in the history by an earlier turn a request referencing tools it never declared — a 400 on OpenAI and several compat providers, reachable by switching models with `/model` mid-session. Incoming history is therefore passed through `flattenToolMessagesToText` ([turn-messages.md](turn-messages.md)) first, which rewrites native tool messages into the same `<tool_result>` text this loop already speaks.

`turnMessages` is everything added on top of that flattened base, including the final answer (the per-step loop appends only the earlier pairs). It is what [conversation.md](conversation.md) persists.

## Key Neighbors

- [loop.md](loop.md): invokes `runParsedToolsLoop` when `isToolsNotSupportedError` fires.
- [tools/index.md](tools/index.md): `createTools` provides the wrapped executors.
- [util/errors.md](../util/errors.md): `isToolsNotSupportedError` triggers the fallback.
- [turn-messages.md](turn-messages.md): the shape boundary this loop sits on the constrained side of.

## Update Triggers

Update this page when the tool call format, loop limits, or the prompt addendum change.
