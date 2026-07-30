# src/agent/system-prompt.ts - System Prompt

**Role:** Builds the static string injected as the `system` message for every agent turn.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
buildSystemPrompt(loadAgentsMd?: boolean, toolNames?: readonly string[]): string
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `loadAgentsMd` defaults to `false`. When `true`, reads `AGENTS.md` from `projectRoot` and appends it under a `# Project Instructions (AGENTS.md)` header; silently omitted if the file does not exist.
- `toolNames` **must be exactly what the caller put in the tool set** — build it with `offeredToolNames` ([tools/tool-names.md](tools/tool-names.md)) from the same flags passed to `createTools`. It defaults to the full set plus `spawn_agent`. Advertising an absent tool sends the model calling something that is not there, and there are two ways to get it wrong: [parsed-tools.md](parsed-tools.md) builds its tools without a `spawnAgent` runner, and a read-only session (the Ctrl+R toggle, `freecode -p`) has no `create`/`edit`/`shell_exec`. [loop.md](loop.md) passes the right list on both paths.

## Behavior

Mostly static, with three things derived from `toolNames`:

- the `Available tools:` line;
- the editing rules, replaced by a "this session is read-only" statement when the set
  contains no write tool — otherwise the prompt instructs a read-only agent to use
  tools it does not have;
- the `HANDY TIPS` section, whose tips are each about a specific tool and are dropped
  with it. "Running broken code often gives you a helpful error message" contradicts
  a session with no `shell_exec`, so an all-read-only set drops the section entirely.

Plus `loadAgentsMd`: when `true` it reads `AGENTS.md` from `projectRoot` at call time and appends the file's contents.
