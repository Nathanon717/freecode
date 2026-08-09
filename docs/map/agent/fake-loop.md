# src/agent/fake-loop.ts - Fake-Fixture Turn Loop

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Runs one turn for `mock:*` fixture models. Extracted from `loop.ts` at the 500-line limit; it is the only path that never touches the AI SDK.

## Read When

- Changing how fixture steps drive tool calls or accumulate text/usage.
- Debugging a `mock:*` e2e test whose fixture matched but whose transcript or result looks wrong.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * The `mock:*` fixture turn. It never touches the AI SDK: `runFakeModel` replays
 * ordered fixture steps against the real system prompt, message history, and tool
 * list, and this loop executes any scripted tool calls through the real
 * `createTools()` wrappers, feeding results back as user messages.
 */
runFakeLlm(providerId: string, modelId: string, supportsTools: boolean, systemPrompt: string, messages: CoreMessage[], options: AgentLoopOptions, modelSettings: Required<...>): Promise<...>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/render/transcript-renderer.ts`](../cli/render/transcript-renderer.md) ×6, [`agent/loop.ts`](loop.md) ×4, [`providers/fake.ts`](../providers/fake.md) ×2, [`agent/parsed-tools.ts`](parsed-tools.md) ×1, [`agent/subagents/run-subagent.ts`](subagents/run-subagent.md) ×1, [`agent/tools/index.ts`](tools/index.md) ×1, [`agent/turn-messages.ts`](turn-messages.md) ×1, [`util/errors.ts`](../util/errors.md) ×1
- **Imported by:** [`agent/loop.ts`](loop.md) ×1

## Tests

`tests/agent/fake-loop.test.ts`.

## Budget

129 / 500 lines (371 to spare).
<!-- END GENERATED MAP FACTS -->

## How It Works

`runFakeModel` (providers/fake.ts) replays ordered fixture steps against the **real** system prompt, message history, and tool-name list, so fixture matching validates the model-facing shape without provider access. Scripted `toolCalls` execute through the real `createTools()` wrappers via `executeToolCalls` (shared with the parsed-tools path), and results are appended as user messages until a step emits no tool calls. The loop is unbounded — the fixture ends it by running out of steps (`runFakeModel` throws) or by emitting a final no-tool response, which then asserts every step was consumed.

## Turn messages

Incoming history is passed through `flattenToolMessagesToText` ([turn-messages.md](turn-messages.md)) before the first step: this loop speaks the text protocol, and a native `role: 'tool'` message persisted by an earlier turn would be sent to a fixture that never declared tools. Reachable by `/model`-ing from a native model to a `mock:*` one mid-session.

The returned `turnMessages` is everything added on top of that flattened base, including the final answer (which the loop does not append for itself). It is what [conversation.md](conversation.md) persists.

**Multi-turn fixtures need `"allowUnusedSteps": true`.** `assertFakeFixtureComplete()` runs at the end of *every* turn, so a fixture whose later steps belong to a later user turn throws on turn 1 — and that throw lands in this loop's catch, which returns **no** `turnMessages` and now an `error`, so the session commits nothing for that turn at all. The symptom is a message count that looks like the pre-persistence behavior, or a turn missing from history entirely. See `tests/e2e/agent-history-tool-turns.e2e.json`.

The catch reports failures through `AgentLoopResult.error`, never by folding `Error: …` into `text` — same rule as [loop.md](loop.md), so the session never persists an error report as an assistant turn (`docs/bug log/28-07-2026.md`). A fixture-mismatch throw therefore prints an error and leaves history untouched, which is what makes `messageCount` matchers usable as history assertions in TTY e2e tests (`tests/e2e/tty-esc-deny-stops-turn.e2e.json`, `tests/e2e/tty-esc-deny-preserves-earlier-steps.e2e.json`).

Note this path pre-dates and bypasses native tool orchestration entirely: there is no `streamText`, no `fullStream`, and no tool-render gate. Transcript framing is driven by hand (`beginTranscriptTurn` / `endTranscriptStep`).

`mock-native:*` is a **different** path — it builds a real `LanguageModel` (`createFakeNativeLanguageModel`) and runs through `streamWithRetry` in `loop.ts` like any provider. Use that one to cover native orchestration behaviour.

## Key Neighbors

- [loop.md](loop.md): dispatches here for `FAKE_PROVIDER_ID`; supplies `AgentLoopOptions`/`AgentLoopResult`/`ModelSettings` as type-only imports (so the cycle is erased at runtime).
- [providers/fake.md](../providers/fake.md): fixture parsing, step matching, and the trace this loop's calls are asserted against.
- [parsed-tools.md](parsed-tools.md): `executeToolCalls`.

## Update Triggers

Update this page when the fixture step protocol, tool-result feedback shape, or fixture-completion assertions change.
