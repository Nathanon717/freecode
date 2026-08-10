# src/agent/parsed-tools.ts - Parsed-Tools Harness

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Fallback agentic loop for models that reject native function calling. Augments the system prompt with a text-based `<tool_call>` protocol and drives a ReAct-style loop by injecting tool results as user messages.

## Read When

- Understanding the parsed-tools fallback path.
- Changing how tool calls are formatted or parsed in text-only mode.
- Debugging tool execution when the model doesn't support native function calling.
<!-- END GENERATED MAP INTENT -->

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
  /** The user pressed Esc at an approval, so the turn ended without a further model call. */
  stopped: boolean;
}

interface ExecutedToolCalls {
  /** `<tool_result>` blocks to feed back to the model, in call order. */
  parts: string[];
  /**
   * The user pressed Esc: the last block is that call's denial and no further
   * model call may be made this turn. The text loops end the turn here.
   */
  stopped: boolean;
}

/**
 * Execute a batch of text-protocol tool calls through the wrapped tools and
 * return the `<tool_result>` blocks to feed back to the model. Shared by the
 * parsed-tools loop and the fake-LLM loop in loop.ts.
 */
executeToolCalls(tools: Record<string, AnyCoreTool>, calls: readonly { name: string; args: Record<string, unknown>; }[], idPrefix: string, messages: CoreMessage[]): Promise<...>

runParsedToolsLoop(messages: CoreMessage[], systemPrompt: string, model: LanguageModelV1, confirmToolCall?: ConfirmToolCall | undefined, toolRationale?: boolean | undefined, readOnly?: boolean | undefined, onStepUsage?: ((promptTokens: number) => void) | undefined): Promise<...>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/render/transcript-renderer.ts`](../cli/render/transcript-renderer.md) ×8, [`logger.ts`](../logger.md) ×5, [`agent/tools/index.ts`](tools/index.md) ×3, [`cli/render/markdown-renderer.ts`](../cli/render/markdown-renderer.md) ×2, [`agent/turn-messages.ts`](turn-messages.md) ×1, [`util/errors.ts`](../util/errors.md) ×1
- **Imported by:** [`agent/fake-loop.ts`](fake-loop.md) ×1, [`agent/loop.ts`](loop.md) ×1

## Tests

`tests/agent/parsed-tools.test.ts`.

## Budget

297 / 500 lines (203 to spare).
<!-- END GENERATED MAP FACTS -->

## How It Works

`executeToolCalls` iterates a list of parsed tool calls against a `createTools` map: unknown tools become error strings (fed back to the model), known tools delegate to their wrapped `execute`. Its only try/catch is for `TurnStoppedError`: the wrappers in `tools/wrappers.ts` turn every other failure — a throwing tool, a denied call — into a result string, but Esc rejects on purpose (the native path needs a missing tool result to stop the SDK stepping). Here that denial text simply becomes the last `<tool_result>` block and `stopped: true` comes back with it, so both text loops commit the step and end the turn instead of asking the model again. See [tools/wrappers.md](tools/wrappers.md#turn-stop-esc). This helper is used by both `runParsedToolsLoop` (text-based protocol) and `runFakeLlm` in `loop.ts` (fake fixture tool execution).

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
