# src/agent/tools/spawn-agent.ts - spawn_agent Tool

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Factory for the `spawn_agent` tool, which lets the main model delegate a focused read-only investigation to a named sub-agent and get back a compact findings report.

## Read When

changing the `spawn_agent` schema/description, or how the model-bound runner is injected.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Bound in agent/loop.ts where the model handle lives; injected into createTools.
 */
type SpawnAgentFn = (agentType: string, prompt: string) => Promise<string>;

makeSpawnAgentTool(spawnAgent: SpawnAgentFn): CoreTool<ZodObject<{ agentType: ZodEnum<[string, ...string[]]>; prompt: ZodString; }, "strip", ZodTypeAny, { agentType: string; prompt: string; }, { ...; }>, string> & { ...; }
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`agent/subagents/registry.ts`](../subagents/registry.md) ×2
- **Imported by:** [`agent/tools/index.ts`](index.md) ×2

## Tests

`tests/agent/tools/spawn-agent.test.ts`.

## Budget

37 / 500 lines (463 to spare).
<!-- END GENERATED MAP FACTS -->

## Notes

- Unlike every other tool this is a **factory** (`makeSpawnAgentTool`), not a static export: `spawn_agent` needs a model handle to run its sub-turn, and a tool's `execute` never receives one. [index.md](index.md) `createTools` is handed a pre-bound `spawnAgent` closure (built in [../loop.md](../loop.md)) and wraps the result here.
- Because it is model-bound, `spawn_agent` is **absent** from the parsed-tools and hand-typed (`tool-runner`) paths, which inject no runner.
- It skips the confirmation wrapper (`requiresConfirmation=false` in `wrap`) since the sub-agent is read-only.
- The `agentType` enum and the advertised catalog come from [../subagents/registry.md](../subagents/registry.md).
