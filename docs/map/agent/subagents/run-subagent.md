# src/agent/subagents/run-subagent.ts - Sub-Agent Runner

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Runs a named sub-agent turn loop that is deliberately *not* the main `agentLoop`. Returns only the sub-agent's final text as a string, so the caller spends one tool call of context instead of the whole search.

## Read When

changing how spawned sub-agents execute, which tools they get, or how the injected model handle reaches them.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Model context for a sub-agent, closed over by the caller where the model lives.
 */
type SubAgentContext =
  | { kind: "native"; model: LanguageModel }
  | {
      kind: "fake";
      providerId: string;
      modelId: string;
      toolRationale: boolean;
      parallelTools: boolean;
    };

runSubAgent(agentType: string, prompt: string, ctx: SubAgentContext): Promise<string>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`agent/subagents/registry.ts`](registry.md) ×4, [`agent/stream-turn.ts`](../stream-turn.md) ×2, [`agent/tools/index.ts`](../tools/index.md) ×1, [`logger.ts`](../../logger.md) ×1, [`providers/fake.ts`](../../providers/fake.md) ×1
- **Imported by:** [`agent/fake-loop.ts`](../fake-loop.md) ×1, [`agent/loop.ts`](../loop.md) ×1

## Tests

`tests/agent/subagents/run-subagent.test.ts`.

## Budget

160 / 500 lines (340 to spare).
<!-- END GENERATED MAP FACTS -->

## Why separate from agentLoop

- **`agentLoop` is not reentrant.** `beginTranscriptTurn`, `beginToolRenderGate`, `beginProviderUsageCapture`, and `setProjectRoot` are all module-level singletons, and a sub-agent starts from inside a tool's `execute` — i.e. mid-stream of the parent. A nested `agentLoop` would close the parent's transcript step, end the parent's usage capture, and release the parent's render gate while the parent is still draining. It also returns `AgentLoopResult` (quota, cost, providerUsage), a shape a tool result cannot consume. The separation is forced, not stylistic.
- Depth limiting falls out for free: `rawReadOnlyTools()` simply omits `spawn_agent`, so no explicit depth tracking is needed.
- Sub-agents use the **raw, unwrapped** read-only tools — `READ_ONLY_TOOL_DEFS` straight from [../tools/index.md](../tools/index.md), without `createTools`' wrappers. That sidesteps three couplings at once: no confirmation prompts, no render-gate participation, no serialized-execution queue (so a sub-agent running inside a wrapped `spawn_agent` cannot deadlock on the parent's queue).
- The model handle a tool's `execute` never receives is injected by the caller via `SubAgentContext`.

## Execution paths (must stay parallel)

- `native` — real/fake-native providers: the AI SDK drives the multi-step tool loop; the stream is drained silently for its text. Draining and rejected-tool-call recovery are delegated to `runRecoveringStream` ([../stream-turn.md](../stream-turn.md)), shared with the main loop; this file supplies only the text-accumulating `onPart`. Any non-rejection error is rethrown for `runSubAgent`'s catch to turn into a visible `Error: the <agent> sub-agent failed: …` tool result. Coverage: `tests/e2e/spawn-agent-native` (mock-native → real `streamText`).
- `fake` — e2e tests only: a manual ReAct loop that calls `runFakeModel`, which shares the module-global `consumedSteps` counter with the parent, so a nested fake call consumes from the *same* flat fixture queue. Coverage: `tests/e2e/spawn-agent-fake`.

Both paths return **only the final step's text** (the segment after the last tool call), so inter-step narration is discarded and the caller receives findings, not chatter — keep them symmetric.

## Known limitations (intentional, v1)

- Sub-agent tokens are **tracked but not displayed**. The sub-agent shares the parent's model handle, so its requests land in the same provider-keyed usage store and reach `providerUsage[]`. What they never reach is the footer's `ctx` number: it only reports the last step's own prompt tokens, and sub-agent calls are not steps (`cli/session-modes.ts`).
- No tool-approval concept inside a sub-agent at all: it runs the raw `READ_ONLY_TOOL_DEFS` directly, bypassing `createTools`'s confirmation wrapper entirely (see the file header comment), so there is nothing for the user to approve or deny in the first place.
- **`spawn_agent` does not exist under the prompt-based tool protocol.** `runParsedToolsLoop` builds its tools without a `spawnAgent` runner, so a model that lacks native tool calling (or has `parsedTools` set) cannot delegate at all — the native runner is never reached. `buildSystemPrompt` takes a `spawnAgent` flag so the parsed-mode prompt does not advertise a tool that is not there; keep the two in sync.

## Key neighbors

- [registry.md](registry.md) — supplies the persona (system prompt + step budget).
- [../loop.md](../loop.md) — constructs the model-bound `SubAgentContext` and passes the runner into `createTools`.
- [../stream-turn.md](../stream-turn.md) — the shared drain/recovery driver the native path runs on.
