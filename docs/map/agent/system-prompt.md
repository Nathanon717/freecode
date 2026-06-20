# src/agent/system-prompt.ts - System Prompt

**Role:** Builds the static string injected as the `system` message for every agent turn.

## Exports

```typescript
buildSystemPrompt(loadAgentsMd?: boolean): string
```

`loadAgentsMd` defaults to `false`. When `true`, the function reads `AGENTS.md` from `projectRoot` (the working directory set by `src/agent/context.ts`) and appends it under a `# Project Instructions (AGENTS.md)` header. If the file does not exist, the section is silently omitted.

## Current Prompt Content

The prompt identifies the model as a coding agent and lists available tools:

```text
read, create, edit, grep, shell_exec, list_dir
```

It instructs the model to:

- Use `list_dir` before assuming files/folders exist.
- Use `create` with complete file contents and real newline characters.
- Treat every tool call as user-approved/denied by the host.
- Acknowledge denied tool calls instead of pretending they succeeded.

## Behavior

The prompt is mostly static. Conditional behavior: when `loadAgentsMd` is `true`, it reads `AGENTS.md` from `projectRoot` at call time and appends the file's contents to the prompt.
