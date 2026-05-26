# src/agent/tools/shell.ts - shell_exec Tool

**Role:** Executes shell commands in the active project root with a regex-based destructive-command guard.

## Exports

```typescript
shellTool: CoreTool
isDestructiveCommand(command: string): boolean
```

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `command` | `string` | required | Command passed to `child_process.exec`. |
| `confirmDestructive` | `boolean` | `false` | Must be true for commands matching destructive patterns. |

## Destructive Patterns

The guard checks command text with word-boundary regexes for:

```text
rm
rmdir
del /f
format <drive>:
git push
git pull
remove-item
```

## Behavior

- Runs with `cwd: projectRoot`.
- Uses a 30-second timeout.
- Returns stdout plus stderr when present.
- Returns `Command completed with no output` for empty success.
- Returns an error string for failed/timeout execution.
