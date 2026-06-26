# src/agent/prompt-tools.ts - Prompt-Based Tool Harness

**Role:** Fallback agentic loop for models that reject native function calling. Augments the system prompt with a text-based `<tool_call>` protocol and drives a ReAct-style loop by injecting tool results as user messages.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
buildPromptToolsSystemPrompt(base: string): string

parseToolCalls(text: string): ParsedToolCall[]

interface PromptToolsResult {
  text: string;
  totalTokens: number;
  promptTokens?: number;
  outputTokens?: number;
}

executeToolCalls(tools: { read: AnyCoreTool; grep: AnyCoreTool; list_dir: AnyCoreTool; } | { create: AnyCoreTool; edit: AnyCoreTool; shell_exec: AnyCoreTool; read: AnyCoreTool; grep: AnyCoreTool; list_dir: AnyCoreTool; }, calls: readonly { ...; }[], idPrefix: string, messages: CoreMessage[]): Promise<...>

runPromptToolsLoop(messages: CoreMessage[], systemPrompt: string, model: LanguageModelV1, confirmToolCall?: ConfirmToolCall | undefined, toolRationale?: boolean | undefined, readOnly?: boolean | undefined): Promise<...>
```
<!-- END GENERATED EXPORTS -->

## Read When

- Understanding the prompt-tools fallback path.
- Changing how tool calls are formatted or parsed in text-only mode.
- Debugging tool execution when the model doesn't support native function calling.

## How It Works

`executeToolCalls` iterates a list of parsed tool calls against a `createTools` map: unknown tools become error strings (fed back to the model), known tools delegate to their wrapped `execute`. This helper is used by both `runPromptToolsLoop` (text-based protocol) and `runFakeLlm` in `loop.ts` (fake fixture tool execution).

`runPromptToolsLoop`:
1. Appends a tool-calling protocol section to the system prompt.
2. Calls `streamText` (no native tools) and buffers the full response.
3. Parses `<tool_call>{"name":"...","args":{...}}</tool_call>` blocks.
4. If no calls: prints the response and returns.
5. If calls: prints any text before the first call, calls `executeToolCalls`, injects all results as a `<tool_result>` user message, and loops (up to 10 steps).

The embedded tool reference must mirror the actual tool schemas; for example `grep` uses `include` for its optional glob filter.

## Key Neighbors

- [loop.md](loop.md): invokes `runPromptToolsLoop` when `isToolsNotSupportedError` fires.
- [tools/index.md](tools/index.md): `createTools` provides the wrapped executors.
- [util/errors.md](../util/errors.md): `isToolsNotSupportedError` triggers the fallback.

## Update Triggers

Update this page when the tool call format, loop limits, or the prompt addendum change.
