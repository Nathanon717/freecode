# src/agent/subagents/run-subagent.ts - Sub-Agent Runner

**Role:** Runs a named sub-agent turn loop that is deliberately *not* the main `agentLoop`. Returns only the sub-agent's final text as a string, so the caller spends one tool call of context instead of the whole search.

**Read when:** changing how spawned sub-agents execute, which tools they get, or how the injected model handle reaches them.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
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

## Why separate from agentLoop

- The main loop ([../loop.md](../loop.md)) is fused to foreground rendering — transcript steps, the [tool-render gate](../tool-render-gate.md), stdout streaming. A sub-agent must avoid all of it, so this is a minimal loop, not a reuse of `agentLoop`.
- Sub-agents use the **raw, unwrapped** read-only tools (`read`/`grep`/`list_dir`) from the tool files directly. That sidesteps three couplings at once: no confirmation prompts, no render-gate participation, no serialized-execution queue (so a sub-agent running inside a wrapped `spawn_agent` cannot deadlock on the parent's queue).
- The model handle a tool's `execute` never receives is injected by the caller via `SubAgentContext`.

## Execution paths (must stay parallel)

- `native` — real/fake-native providers: the AI SDK drives the multi-step tool loop; the stream is drained silently for its text. Coverage: `tests/e2e/spawn-agent-native` (mock-native → real `streamText`).
- `fake` — e2e tests only: a manual ReAct loop that calls `runFakeModel`, which shares the module-global `consumedSteps` counter with the parent, so a nested fake call consumes from the *same* flat fixture queue. Coverage: `tests/e2e/spawn-agent-fake`.

Both paths return **only the final step's text** (the segment after the last tool call), so inter-step narration is discarded and the caller receives findings, not chatter — keep them symmetric.

## Known limitations (intentional, v1)

- Sub-agent token usage does **not** roll into the parent's `ctx` count; the delegated turn's tokens are spent but not surfaced in the footer.
- No abort-signal propagation into the sub-agent; a user abort surfaces at the parent tool boundary.
- No parsed-tools fallback: if a real provider lacks native tool calling, the native sub-agent returns a graceful error string rather than degrading to the text protocol.

## Key neighbors

- [registry.md](registry.md) — supplies the persona (system prompt + step budget).
- [../loop.md](../loop.md) — constructs the model-bound `SubAgentContext` and passes the runner into `createTools`.
