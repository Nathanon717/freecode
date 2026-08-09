# src/cli/session-runner.ts - CLI Session Loop

**Role:** Generic loop that reads inputs from a mode and dispatches them until EOF or exit.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface CliSessionMode {
  readInput(this: void): Promise<string | null>;
  confirmToolCall: ConfirmToolCall;
  getReadOnly?(this: void): boolean;
  modelListMode: ModelListMode;
  skipStrayConfirmations?: boolean;
  beforeAgentCall?(this: void): void | Promise<void>;
  afterAgentCall?(this: void): void | Promise<void>;
  onAgentResult?(this: void, result: AgentLoopResult): void | Promise<void>;
  onStepUsage?(this: void, info: { providerId: string; modelId: string; promptTokens: number }): void;
  beforeScreenClear?(this: void): void | Promise<void>;
  afterScreenClear?(this: void): void | Promise<void>;
  runConfig?(this: void): Promise<void>;
  runModelMenu?(this: void): Promise<void>;
  runEvalMenu(this: void): Promise<void>;
  beforeDispatch?(this: void): void | Promise<void>;
  afterDispatch?(this: void): void | Promise<void>;
  onExit?(this: void): void | Promise<void>;
  onInputExhausted?(this: void): void | Promise<void>;
}

runCliSession(options: CliSessionRunnerOptions): Promise<void>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/command-dispatcher.ts`](command-dispatcher.md) ×3, [`agent/conversation.ts`](../agent/conversation.md) ×1, [`agent/loop.ts`](../agent/loop.md) ×1, [`agent/tools/index.ts`](../agent/tools/index.md) ×1
- **Imported by:** [`cli/scripted-mode.ts`](scripted-mode.md) ×1, [`cli/session-modes.ts`](session-modes.md) ×1

## Tests

`tests/cli/session-runner.test.ts`.

## Budget

76 / 500 lines (424 to spare).
<!-- END GENERATED MAP FACTS -->

## `CliSessionMode`

Modes provide:

- `readInput()`: returns the next input or `null` when exhausted.
- `confirmToolCall`: approval callback passed to tools.
- `modelListMode`: `full` or `current-only`.
- Hooks for dispatch, agent calls, screen clearing, scenario menus, config, model picker, exit, and input exhaustion.

## Flow

```text
while true:
  input = mode.readInput()
  if input is null:
    mode.onInputExhausted()
    return
  mode.beforeDispatch()
  result = dispatchCommand(input, runtime)
  mode.afterDispatch()
  if result is "exit":
    mode.onExit()
    return
```

`dispatchCommand()` currently returns `continue` for all implemented commands, but the runner supports `exit` for future command additions.
