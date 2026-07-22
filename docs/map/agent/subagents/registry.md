# src/agent/subagents/registry.ts - Sub-Agent Registry

**Role:** Declares the named sub-agent personas the main loop can spawn via `spawn_agent` — each an id, one-line description, specialized system prompt, and step budget. Ships the `explore` persona (a terse, cited, read-only code-mapping contract).

**Read when:** adding or editing a callable agent persona, or changing what `spawn_agent` advertises.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface AgentPersona {
  /** Stable id the model passes as spawn_agent's `agentType`. */
  name: string;
  /** One line shown to the main model in the spawn_agent tool description. */
  description: string;
  /** System prompt the sub-agent runs under, in place of the main prompt. */
  systemPrompt: string;
  /** Max tool-call rounds before the sub-agent returns whatever it has. */
  maxSteps: number;
}

getAgentPersona(name: string): AgentPersona | undefined

listAgentNames(): string[]

agentCatalog(): string
```
<!-- END GENERATED EXPORTS -->

## Notes

- `agentCatalog()` feeds the `spawn_agent` tool description and unknown-agent errors, so its wording is model-facing.
- `listAgentNames()` is the source of `spawn_agent`'s `agentType` enum in [../tools/spawn-agent.md](../tools/spawn-agent.md) — adding a persona here widens that enum automatically.

## Key neighbors

- [run-subagent.md](run-subagent.md) — consumes a persona to drive the sub-turn loop.
- [../tools/spawn-agent.md](../tools/spawn-agent.md) — exposes these personas to the model.
