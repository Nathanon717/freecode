# src/agent/fake-loop.ts - Fake-Fixture Turn Loop

**Role:** Runs one turn for `mock:*` fixture models. Extracted from `loop.ts` at the 500-line limit; it is the only path that never touches the AI SDK.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
runFakeLlm(providerId: string, modelId: string, supportsTools: boolean, systemPrompt: string, messages: CoreMessage[], options: AgentLoopOptions, modelSettings: Required<...>): Promise<...>
```
<!-- END GENERATED EXPORTS -->

## Read When

- Changing how fixture steps drive tool calls or accumulate text/usage.
- Debugging a `mock:*` e2e test whose fixture matched but whose transcript or result looks wrong.

## How It Works

`runFakeModel` (providers/fake.ts) replays ordered fixture steps against the **real** system prompt, message history, and tool-name list, so fixture matching validates the model-facing shape without provider access. Scripted `toolCalls` execute through the real `createTools()` wrappers via `executeToolCalls` (shared with the parsed-tools path), and results are appended as user messages until a step emits no tool calls. The loop is unbounded — the fixture ends it by running out of steps (`runFakeModel` throws) or by emitting a final no-tool response, which then asserts every step was consumed.

Note this path pre-dates and bypasses native tool orchestration entirely: there is no `streamText`, no `fullStream`, and no tool-render gate. Transcript framing is driven by hand (`beginTranscriptTurn` / `endTranscriptStep`).

`mock-native:*` is a **different** path — it builds a real `LanguageModel` (`createFakeNativeLanguageModel`) and runs through `streamWithRetry` in `loop.ts` like any provider. Use that one to cover native orchestration behaviour.

## Key Neighbors

- [loop.md](loop.md): dispatches here for `FAKE_PROVIDER_ID`; supplies `AgentLoopOptions`/`AgentLoopResult`/`ModelSettings` as type-only imports (so the cycle is erased at runtime).
- [providers/fake.md](../providers/fake.md): fixture parsing, step matching, and the trace this loop's calls are asserted against.
- [parsed-tools.md](parsed-tools.md): `executeToolCalls`.

## Update Triggers

Update this page when the fixture step protocol, tool-result feedback shape, or fixture-completion assertions change.
