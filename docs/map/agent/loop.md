# src/agent/loop.ts - Agent Loop

**Role:** Executes one model turn. It routes to a provider, sets the active project root, builds the system prompt, streams text, optionally enables tools, and returns response metadata.

## Exports

```typescript
interface AgentLoopResult {
  text: string;
  usage: { totalTokens: number };
  providerId: string;
  modelId: string;
  quota: GroqRateLimitHeaders | null;
}

agentLoop(
  messages: CoreMessage[],
  projectRoot: string,
  modelPreference?: string,
  options?: { confirmToolCall?: ConfirmToolCall }
): Promise<AgentLoopResult>
```

## Imports

| Symbol | Source |
|--------|--------|
| `streamText`, `CoreMessage`, `LanguageModel` | `ai` |
| `route` | `../providers/router` |
| `buildSystemPrompt` | `./system-prompt` |
| `createTools`, `ConfirmToolCall` | `./tools/index` |
| `getLastCapturedHeaders` | `../providers/adapters/openai-compat` |
| `GroqRateLimitHeaders` | `../providers/quota/headers` |
| `log`, `logError` | `../logger` |
| `setProjectRoot` | `./context` |

## Execution Flow

```text
setProjectRoot(projectRoot)
route([], modelPreference)
  -> on failure, return synthetic error result
buildSystemPrompt()
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
if DEBUG_QUOTA !== "0":
  read most recent captured headers for providerId
return AgentLoopResult
```

## Tool Behavior

- Tools are only passed when the routed provider reports `supportsTools: true`.
- `maxSteps: 10` allows multi-step tool use.
- Tool approval is delegated to the supplied `confirmToolCall`.
- Tool wrappers serialize execution so concurrent tool calls do not mutate files in parallel.

## Error Handling

- Routing errors do not throw; they return `providerId: "none"`, `modelId: "none"`, zero tokens, and an error text.
- Stream errors are logged and returned with any partial text plus an appended error message.
- `serializeError()` preserves custom enumerable/non-enumerable error fields for logs.
