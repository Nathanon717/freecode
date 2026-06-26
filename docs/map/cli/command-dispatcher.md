# src/cli/command-dispatcher.ts - Command Dispatcher

**Role:** Handles slash commands and sends normal user input to the agent loop.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type CommandDispatchResult = 'continue' | 'exit';

type ModelListMode = 'current-only' | 'full';

interface CommandRuntime {
  projectRoot: string;
  session: SessionController;
  getSelectedModel(): string;
  setSelectedModel(model: string): void;
  confirmToolCall: ConfirmToolCall;
  getReadOnly?(): boolean;
  modelListMode: ModelListMode;
  skipStrayConfirmations?: boolean;
  beforeAgentCall?(): void | Promise<void>;
  afterAgentCall?(): void | Promise<void>;
  onAgentResult?(result: AgentLoopResult): void | Promise<void>;
  beforeScreenClear?(): void | Promise<void>;
  afterScreenClear?(): void | Promise<void>;
  runConfig?(): Promise<void>;
  runModelMenu?(): Promise<void>;
  runEvalMenu(): Promise<void>;
}

dispatchCommand(input: string, runtime: CommandRuntime): Promise<CommandDispatchResult>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `CommandRuntime` is the dependency bundle assembled and passed by `runCliSession()`.

## Slash Commands

| Command | Behavior |
|---------|----------|
| `/model [id]` | Without an arg, opens the interactive picker when available or shows status. With an arg, sets selected model. |
| `/models [id]` | Alias for `/model [id]`. |
| `/config` | Runs config editor if the current mode supplies `runConfig`; otherwise prints unavailable. |
| `/help` | Prints slash command help plus CLI flags. |
| `/test` | Opens/renders non-LLM scenario menu. |
| `/eval` | Opens/renders LLM eval scenario menu. |
| `/keys` | Prints API key status from env/config. |
| `/clear` | Clears in-memory history and Anthropic session cost, redraws banner, and restores screen hooks. |

## Agent Turns

Non-command input is handled by `sendToAgent()`:

1. Append user input to `SessionController.messages`.
2. Run `beforeAgentCall`.
3. If `FREECODE_RESULT_JSON` is set, write a placeholder entry with provider/model info (tokens=0) so the footer reflects the correct model immediately.
4. Call `agentLoop(messages, projectRoot, selectedModel, { confirmToolCall, onPartialResult })`. `onPartialResult` updates the placeholder entry with quota headers as soon as the first API response arrives.
5. Run `onAgentResult`.
6. Replace the placeholder entry in `FREECODE_RESULT_JSON` with the full result (tokens, quota, model).
7. Append assistant message.
8. When using Anthropic, print estimated turn cost, session total, and a token/rate breakdown when available.
9. When non-OpenAI-compatible provider usage was captured, print the raw provider usage JSON.
10. Run `afterAgentCall`.

Errors are logged and printed, not thrown through the session loop.
