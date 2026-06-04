# src/agent/prompt-tools.ts - Prompt-Based Tool Harness

**Role:** Fallback agentic loop for models that reject native function calling. Augments the system prompt with a text-based `<tool_call>` protocol and drives a ReAct-style loop by injecting tool results as user messages.

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

runPromptToolsLoop(
  messages: CoreMessage[],
  systemPrompt: string,
  model: LanguageModel,
  confirmToolCall?: ConfirmToolCall,
  toolRationale?: boolean,
): Promise<PromptToolsResult>
```

## Read When

- Understanding the prompt-tools fallback path.
- Changing how tool calls are formatted or parsed in text-only mode.
- Debugging tool execution when the model doesn't support native function calling.

## How It Works

1. Appends a tool-calling protocol section to the system prompt.
2. Calls `streamText` (no native tools) and buffers the full response.
3. Parses `<tool_call>{"name":"...","args":{...}}</tool_call>` blocks.
4. If no calls: prints the response and returns.
5. If calls: prints any text before the first call, then for each call calls the wrapped tool from `createTools` (which handles logging, confirmation, and result display), then injects all results as a `<tool_result>` user message and loops (up to 10 steps).

The embedded tool reference must mirror the actual tool schemas; for example `grep` uses `include` for its optional glob filter.

## Key Neighbors

- [loop.md](loop.md): invokes `runPromptToolsLoop` when `isToolsNotSupportedError` fires.
- [tools/index.md](tools/index.md): `createTools` provides the wrapped executors.
- [util/errors.md](../util/errors.md): `isToolsNotSupportedError` triggers the fallback.

## Update Triggers

Update this page when the tool call format, loop limits, or the prompt addendum change.
