# src/agent/loop.ts - Agent Loop

**Role:** Executes one model turn. It routes to a provider, sets the active project root, builds the system prompt, streams text, optionally enables tools, and returns response metadata.

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
if provider is Anthropic:
  begin usage capture
streamText({
  model,
  system,
  messages,
  ...(supportsTools ? { tools: createTools(confirmToolCall), maxSteps: 10 } : {})
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
- `maxSteps: 10` allows multi-step tool use.
- Tool approval is delegated to the supplied `confirmToolCall`.
- Tool wrappers serialize execution so concurrent tool calls do not mutate files in parallel.

## Key Neighbors

- [providers/router.md](../providers/router.md): resolves provider/model.
- [system-prompt.md](system-prompt.md): builds the prompt.
- [tools/index.md](tools/index.md): creates tool wrappers.
- [providers/adapters/openai-compat.md](../providers/adapters/openai-compat.md) and [providers/adapters/anthropic.md](../providers/adapters/anthropic.md): capture provider metadata and usage details.

## Error Handling

- Routing errors do not throw; they return `providerId: "none"`, `modelId: "none"`, zero tokens, and an error text.
- Stream errors are logged and returned with any partial text plus an appended error message. Anthropic usage capture is ended on this path so any available partial cost metadata can still be returned.

## Update Triggers

Update this page when `agentLoop()` inputs/outputs, execution flow, or major consumers change.
