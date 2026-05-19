# src/cli/session-controller.ts - Session Controller

**Role:** Owns the in-memory conversation for a CLI session and bridges it to JSON session persistence.

## Exports

| Symbol | Description |
|--------|-------------|
| `SessionController` | Class wrapping current session ID, `CoreMessage[]`, persistence, resume, and token estimation. |

## Methods

| Method | Description |
|--------|-------------|
| `createSession()` | Creates a new DB session for `projectRoot` and resets Anthropic session cost tracking. |
| `resumeLast()` | Loads the most recent DB session for `projectRoot` into `messages`. |
| `clearMessages()` | Clears in-memory history only. |
| `getContextTokenCount()` | Returns `estimateContextTokens(messages)`. |
| `addUserMessage(content)` | Appends a user `CoreMessage`. |
| `addAssistantMessage(content)` | Appends an assistant `CoreMessage`. |
| `saveExchange(userInput, assistantText, totalTokens)` | Persists user and assistant messages when a session exists. |

## Persistence Model

The agent loop receives in-memory `messages`. Persistence is explicit through `saveExchange()` after the turn completes.

Anthropic session cost totals are process-local metadata, not persisted with session messages.
