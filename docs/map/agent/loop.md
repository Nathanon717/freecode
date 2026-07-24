# src/agent/loop.ts - Agent Loop

**Role:** Executes one model turn. It routes to a provider, sets the active project root, builds the system prompt, streams or generates text, optionally enables tools, and returns response metadata.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface AgentLoopResult {
  text: string;
  usage: { totalTokens: number; promptTokens?: number; outputTokens?: number };
  providerId: string;
  modelId: string;
  quota: RateLimitSnapshot | null;
  providerUsage?: CapturedProviderUsage[];
  costEstimate?: CostEstimate;
}

agentLoop(messages: CoreMessage[], projectRoot: string, modelPreference?: string | undefined, options?: AgentLoopOptions): Promise<AgentLoopResult>
```
<!-- END GENERATED EXPORTS -->

## Read When

- Changing model turn execution, tool enablement, or stream error handling.
- Debugging quota/cost metadata returned from a provider call.
- Changing project-root setup before tools run.

## Execution Flow

```text
setProjectRoot(projectRoot)
route(modelPreference)
  -> on failure, return synthetic error result
buildSystemPrompt(modelSettings.loadAgentsMd)
if provider is OpenAI:
  build Responses payload
  call direct Responses adapter
  write transcript step dividers around tool-producing Responses iterations
  estimate OpenAI turn cost from exact Responses usage
else if provider is mock:
  run ordered fake fixture steps after building the real system prompt/tool list
  execute scripted fake tool calls via executeToolCalls() from parsed-tools.ts
  feed tool results back as user messages until the fixture emits final text
else if provider is Anthropic:
  begin usage capture
streamText({
  model,
  system,
  messages,
  ...(supportsTools ? { tools: createTools(confirmToolCall), maxSteps: 10, onStepFinish } : {})
})
beginToolRenderGate()                     (tool-render-gate.ts)
for await part of fullStream:             (ordered: text-delta -> tool-call -> tool-result)
  text-delta:  write to stdout, append to fullText
  tool-call:   flush pending preamble line, then releaseToolRenderGate()
  step-finish: remember this step's own promptTokens (last one = the context size)
  error:       capture and re-throw after the loop (fullStream reports, not throws)
endToolRenderGate()
await usage  (promptTokens = last step's, NOT the SDK's step-summed total)
finalizeUsageCapture(providerId, modelId, promptTokens, outputTokens)   (usage-finalize.ts)
  -> ends Anthropic SSE capture or OpenAI-compat raw capture
  -> fetches verified pricing and estimates turn cost
  -> reads most recent rate-limit headers
  (also runs on catch path so partial cost/quota survives stream failures)
return AgentLoopResult
```

## Tool Behavior

- Tools are only passed when the routed provider reports `supportsTools: true`.
- For `mock:*` fake models, the loop does not call the AI SDK. It passes the real system prompt, message history, and available tool names into `runFakeModel()` so fixture matching can validate the model-facing shape without live provider access. If a fake step emits `toolCalls`, the loop executes them through `createTools()`, appends tool results as user messages, and continues until a final no-tool response.
- `maxSteps: 10` allows multi-step tool use.
- Every turn calls `beginTranscriptTurn()` / `endTranscriptStep()` from `transcript-renderer.ts` to emit the normalised divider framing. Intermediate steps use `endTranscriptStep(true)` (combined close+open); the final step uses `endTranscriptStep(false)` after text normalisation. The renderer state machine ensures consistent blank-line spacing regardless of the model or provider.
- `streamWithRetry` drives display from the ordered `fullStream` (not the text-only `textStream`) so a step's preamble can never render after the tool call it precedes. Because the AI SDK invokes a tool's `execute` (which draws the header) before that preamble reaches the consumer, the `tool-render-gate.ts` semaphore holds `execute` until the consumer processes that call's `tool-call` part and flushes the pending text. See [tool-render-gate.md](tool-render-gate.md).
- Tool approval is delegated to the supplied `confirmToolCall`.
- Tool wrappers serialize execution so concurrent tool calls do not mutate files in parallel.
- If the provider rejects tool use at runtime (`isToolsNotSupportedError`), the loop automatically retries via `runParsedToolsLoop` from `parsed-tools.ts`, which uses a text-based `<tool_call>` protocol instead of native function calling. The rejection is persisted via `setNativeTools(provider, modelId, false)` (model-data) so the fallback is used automatically next time; the startup read uses `isNativeToolsDisabled`. The user can also manually enable this path by setting `parsedTools: true` in per-model settings (via `/config` → Model tab); both routes check `modelSettings.parsedTools || isNativeToolsDisabled(...)` at the top of `streamWithRetry`.

## Internal Helpers

- `runFakeLlm(providerId, modelId, ...)` — handles the entire `FAKE_PROVIDER_ID` path including transcript step management. Delegates tool execution to `executeToolCalls` from `parsed-tools.ts` (shared with the text-based fallback path). Returns `AgentLoopResult` directly, so `agentLoop` returns immediately after calling it.
- `streamWithRetry(languageModel, supportsTools, ...)` — runs the `while(true)` streaming loop for all non-fake providers (OpenAI included — there is no separate OpenAI dispatch path). Handles the three retry cases (tool-not-supported fallback, provider-rejected malformed call, no-such-tool, invalid-args) and returns a `StreamResult` with the accumulated text and token counts. Throws on non-retriable errors, which propagate to `agentLoop`'s catch.
- **Context-size (`ctx`) token source.** The native `fullStream` consumer records each `step-finish` part's own `promptTokens` and uses the **last** one as the turn's `promptTokens`, *not* `result.usage.promptTokens` — which ai@3.4 returns SUMMED across every step of a multi-step tool turn (`combinedUsage`), so using it would report roughly step-count× the real context and could exceed the window. For a single-step turn the two are identical. This is the number `cli/session-modes.ts` feeds the footer `ctx` slot (except for Anthropic, which it suppresses — its count omits cache tokens); the summing trap is regression-pinned by the multi-step mock-native test in `tests/agent/loop.test.ts` (last step = 20, not 10+20=30). The parsed-tools fallback path is already last-wins (one single-step `streamText` per iteration).
- **`onStepUsage` — the per-step `ctx` tick.** An `AgentLoopOptions` callback fired at every step boundary with that step's own `promptTokens`, so the footer's context size climbs during a multi-step tool turn rather than jumping once at the end. Emitted from three places so every execution path ticks: the native `onStepFinish` handler (using `event.usage`, which is per-step — unlike the awaited `result.usage`), `runFakeLlm`'s per-step loop (this is what the TTY e2e tests exercise), and `runParsedToolsLoop` via an optional callback param. Values climb within a turn because each step resends a longer history; the last one equals the turn's final `promptTokens`. Consumer side lives in `cli/session-modes.ts`.
- `finalizeUsageCapture(...)` now lives in [usage-finalize.md](usage-finalize.md) (extracted at the 500-line limit). `agentLoop` imports it and calls it on both the success and catch paths, feeding the result through `applyUsageOutcome`; for Anthropic it overrides `promptTokens` with the provider's own `inputTokens`.

## Key Neighbors

- [providers/provider-registry.md](../providers/provider-registry.md): resolves provider/model.
- [system-prompt.md](system-prompt.md): builds the prompt.
- [tools/index.md](tools/index.md): creates tool wrappers.
- [providers/adapters/openai-compat.md](../providers/adapters/openai-compat.md) and [providers/adapters/anthropic.md](../providers/adapters/anthropic.md): capture provider metadata and usage details.
- [providers/fake.md](../providers/fake.md): fake fixture runner for free agent-loop verification.
- [providers/model-data.md](../providers/model-data.md): `isNativeToolsDisabled`/`setNativeTools` for the native-tools fallback trait.
- [tool-render-gate.md](tool-render-gate.md): orders streamed text before tool-call headers on the native `fullStream` path.
- [usage-finalize.md](usage-finalize.md): ends usage capture and computes cost/quota for each turn.

## Error Handling

- Routing errors do not throw; they return `providerId: "none"`, `modelId: "none"`, zero tokens, and an error text.
- Stream errors are logged and returned with any partial text plus an appended detailed error message. API errors include parsed provider fields such as `code`, `type`, and `failed_generation` when the SDK exposes them. Anthropic usage capture is ended on this path so any available partial cost metadata can still be returned.
- Context-overflow errors (`isContextOverflowError`) are detected as a distinct subcase: a specific multi-line user-facing message is printed to stdout explaining the limit was exceeded and suggesting starting a new session or switching to a larger-context model via `/model`. The returned `text` carries a condensed single-line version of this message.

## Update Triggers

Update this page when `agentLoop()` inputs/outputs, execution flow, or major consumers change.
