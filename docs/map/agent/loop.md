# src/agent/loop.ts - Agent Loop

**Role:** Executes one model turn. It routes to a provider, sets the active project root, builds the system prompt, streams or generates text, optionally enables tools, and returns response metadata.

## Exports

```typescript
interface AgentLoopResult {
  text: string;
  usage: { totalTokens: number; promptTokens?: number; outputTokens?: number };
  providerId: string;
  modelId: string;
  quota: GroqRateLimitHeaders | null;
  providerUsage?: CapturedProviderUsage[];
  costEstimate?: CostEstimate;
}

agentLoop(
  messages: CoreMessage[],
  projectRoot: string,
  modelPreference?: string,
  options?: { confirmToolCall?: ConfirmToolCall }
): Promise<AgentLoopResult>
```

## Read When

- Changing model turn execution, tool enablement, or stream error handling.
- Debugging quota/cost metadata returned from a provider call.
- Changing project-root setup before tools run.

## Execution Flow

```text
setProjectRoot(projectRoot)
route(modelPreference)
  -> on failure, return synthetic error result
buildSystemPrompt()
if provider is OpenAI:
  build Responses payload
  call direct Responses adapter
  write transcript step dividers around tool-producing Responses iterations
  estimate OpenAI turn cost from exact Responses usage
else if provider is mock:
  run ordered fake fixture steps after building the real system prompt/tool list
  execute scripted fake tool calls through the normal tool wrappers
  feed tool results back as user messages until the fixture emits final text
else if provider is Anthropic:
  begin usage capture
streamText({
  model,
  system,
  messages,
  ...(supportsTools ? { tools: createTools(confirmToolCall), maxSteps: 10, onStepFinish } : {})
})
for await chunk of textStream:
  write chunk to stdout
  append to fullText
await usage
if provider is Anthropic:
  end usage capture
  fetch live/fallback pricing
  estimate turn cost
else if provider is OpenAI-compatible:
  end raw provider usage capture
if DEBUG_QUOTA !== "0":
  read most recent captured OpenAI-compatible or Anthropic headers for providerId
return AgentLoopResult
```

## Tool Behavior

- Tools are only passed when the routed provider reports `supportsTools: true`.
- For `mock:*` fake models, the loop does not call the AI SDK. It passes the real system prompt, message history, and available tool names into `runFakeModel()` so fixture matching can validate the model-facing shape without live provider access. If a fake step emits `toolCalls`, the loop executes them through `createTools()`, appends tool results as user messages, and continues until a final no-tool response.
- `maxSteps: 10` allows multi-step tool use.
- Tool-enabled turns write visible transcript dividers before tool execution and after each tool-producing model step.
- Tool approval is delegated to the supplied `confirmToolCall`.
- Tool wrappers serialize execution so concurrent tool calls do not mutate files in parallel.
- If the provider rejects tool use at runtime (`isToolsNotSupportedError`), the loop automatically retries via `runPromptToolsLoop` from `prompt-tools.ts`, which uses a text-based `<tool_call>` protocol instead of native function calling.

## Key Neighbors

- [providers/registry.md](../providers/registry.md): resolves provider/model.
- [system-prompt.md](system-prompt.md): builds the prompt.
- [tools/index.md](tools/index.md): creates tool wrappers.
- [providers/adapters/openai-responses.md](../providers/adapters/openai-responses.md): direct OpenAI Responses generation and usage capture.
- [providers/adapters/openai-compat.md](../providers/adapters/openai-compat.md) and [providers/adapters/anthropic.md](../providers/adapters/anthropic.md): capture provider metadata and usage details for other providers.
- [providers/fake.md](../providers/fake.md): fake fixture runner for free agent-loop verification.

## Error Handling

- Routing errors do not throw; they return `providerId: "none"`, `modelId: "none"`, zero tokens, and an error text.
- Stream errors are logged and returned with any partial text plus an appended detailed error message. API errors include parsed provider fields such as `code`, `type`, and `failed_generation` when the SDK exposes them. Anthropic usage capture is ended on this path so any available partial cost metadata can still be returned.
- Context-overflow errors (`isContextOverflowError`) are detected as a distinct subcase: a specific multi-line user-facing message is printed to stdout explaining the limit was exceeded and suggesting starting a new session or switching to a larger-context model via `/model`. The returned `text` carries a condensed single-line version of this message.

## Update Triggers

Update this page when `agentLoop()` inputs/outputs, execution flow, or major consumers change.
