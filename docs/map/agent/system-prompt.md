# src/agent/system-prompt.ts - System Prompt

**Role:** Builds the static string injected as the `system` message for every agent turn.

## Exports

```typescript
buildSystemPrompt(): string
```

## Current Prompt Content

The prompt identifies the model as a coding agent and lists available tools:

```text
read_file, write_file, grep, shell_exec, list_dir
```

It instructs the model to:

- Use `list_dir` before assuming files/folders exist.
- Use `write_file` with complete file contents and real newline characters.
- Treat every tool call as user-approved/denied by the host.
- Acknowledge denied tool calls instead of pretending they succeeded.
- Prefer `grep` before `read_file` when looking for specific content.

## Behavior

The prompt is static. It does not read config, project files, user input, or session state.
