# src/cli/command-dispatcher.ts - Command Dispatcher

**Role:** Handles slash commands and sends normal user input to the agent loop.

## Exports

| Symbol | Description |
|--------|-------------|
| `CommandDispatchResult` | `'continue' \| 'exit'`. |
| `ModelListMode` | `'current-only' \| 'full'`. |
| `CommandRuntime` | Dependency bundle passed by `runCliSession()`. |
| `formatQuotaReset` | Formats raw or millisecond quota reset values. |
| `dispatchCommand` | Main command/user-input dispatcher. |

## Slash Commands

| Command | Behavior |
|---------|----------|
| `/model [id]` | Without an arg, opens the interactive picker when available or shows status. With an arg, sets selected model. |
| `/models [id]` | Alias for `/model [id]`. |
| `/config` | Runs config editor if the current mode supplies `runConfig`; otherwise prints unavailable. |
| `/claude [msg]` | Calls `runClaudeHelp` with optional user note; interactive-only. Diagnoses from screen buffer, optionally spawns `claude` (Claude Code) to apply the fix, then exits freecode. |
| `/help` | Prints slash command help plus CLI flags. |
| `/test` | Opens/renders non-LLM scenario menu. |
| `/eval` | Opens/renders LLM eval scenario menu. |
| `/keys` | Prints API key status from env/config. |
| `/sources` | Prints the static model data source catalog used for future gatherers. |
| `/model-sources` | Alias for `/sources`. |
| `/resume` | Loads the most recent persisted session for the current project root. |
| `/clear` | Clears in-memory history and Anthropic session cost, redraws banner, and restores screen hooks. |

## Agent Turns

Non-command input is handled by `sendToAgent()`:

1. Append user input to `SessionController.messages`.
2. Run `beforeAgentCall`.
3. Call `agentLoop(messages, projectRoot, selectedModel, { confirmToolCall })`.
4. Run `onAgentResult`.
5. Append assistant message and persist the exchange.
6. When using Anthropic, print estimated turn cost, session total, and a token/rate breakdown when available.
7. When non-OpenAI-compatible provider usage was captured, print the raw provider usage JSON.
8. Run `afterAgentCall`.

Errors are logged and printed, not thrown through the session loop.
