# src/agent/system-prompt.ts - System Prompt

**Role:** Builds the static string injected as the `system` message for every agent turn.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
buildSystemPrompt(loadAgentsMd?: boolean, spawnAgent?: boolean): string
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `loadAgentsMd` defaults to `false`. When `true`, reads `AGENTS.md` from `projectRoot` and appends it under a `# Project Instructions (AGENTS.md)` header; silently omitted if the file does not exist.
- `spawnAgent` defaults to `true` and must mirror whether the caller actually put `spawn_agent` in the tool set. It gates both the `Available tools:` line and the delegation tip. [parsed-tools.md](parsed-tools.md) builds its tools without a `spawnAgent` runner, so [loop.md](loop.md) rebuilds the prompt with `false` before entering that path — otherwise the model is told to call a tool that does not exist.

## Behavior

The prompt is mostly static. Conditional behavior: when `loadAgentsMd` is `true`, it reads `AGENTS.md` from `projectRoot` at call time and appends the file's contents to the prompt.
