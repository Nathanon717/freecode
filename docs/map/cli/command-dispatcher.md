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
| `/resume` | Loads the most recent persisted session for the current project root. |
| `/clear` | Clears in-memory history and Anthropic session cost, redraws banner, and restores screen hooks. |

## Agent Turns

Non-command input is handled by `sendToAgent()`:

1. Append user input to `SessionController.messages`.
2. Run `beforeAgentCall`.
3. If `FREECODE_RESULT_JSON` is set, write a placeholder entry with provider/model info (tokens=0) so the footer reflects the correct model immediately.
4. Call `agentLoop(messages, projectRoot, selectedModel, { confirmToolCall, onPartialResult })`. `onPartialResult` updates the placeholder entry with quota headers as soon as the first API response arrives.
5. Run `onAgentResult`.
6. Replace the placeholder entry in `FREECODE_RESULT_JSON` with the full result (tokens, quota, model).
7. Append assistant message and persist the exchange.
8. When using Anthropic, print estimated turn cost, session total, and a token/rate breakdown when available.
9. When non-OpenAI-compatible provider usage was captured, print the raw provider usage JSON.
10. Run `afterAgentCall`.

Errors are logged and printed, not thrown through the session loop.
