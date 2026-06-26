# src/agent/system-prompt.ts - System Prompt

**Role:** Builds the static string injected as the `system` message for every agent turn.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
buildSystemPrompt(loadAgentsMd?: boolean): string
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `loadAgentsMd` defaults to `false`. When `true`, reads `AGENTS.md` from `projectRoot` and appends it under a `# Project Instructions (AGENTS.md)` header; silently omitted if the file does not exist.

## Behavior

The prompt is mostly static. Conditional behavior: when `loadAgentsMd` is `true`, it reads `AGENTS.md` from `projectRoot` at call time and appends the file's contents to the prompt.
