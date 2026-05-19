# src/cli/session-runner.ts - CLI Session Loop

**Role:** Generic loop that reads inputs from a mode and dispatches them until EOF or exit.

## Exports

| Symbol | Description |
|--------|-------------|
| `CliSessionMode` | Interface implemented by interactive and scripted modes. |
| `runCliSession` | Reads input, calls `dispatchCommand()`, and invokes lifecycle hooks. |

## `CliSessionMode`

Modes provide:

- `readInput(tokenCount)`: returns the next input or `null` when exhausted.
- `confirmToolCall`: approval callback passed to tools.
- `modelListMode`: `full` or `current-only`.
- Hooks for agent calls, screen clearing, scenario menus, config, model picker, exit, and input exhaustion.

## Flow

```text
while true:
  input = mode.readInput(session.getContextTokenCount())
  if input is null:
    mode.onInputExhausted()
    return
  result = dispatchCommand(input, runtime)
  if result is "exit":
    mode.onExit()
    return
```

`dispatchCommand()` currently returns `continue` for all implemented commands, but the runner supports `exit` for future command additions.
