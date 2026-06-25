# src/agent/session-controller.ts - Session Controller

**Role:** Owns the in-memory conversation for a CLI session and provides token estimation.

## Exports

| Symbol | Description |
|--------|-------------|
| `SessionController` | Class wrapping `CoreMessage[]` and token estimation. |

## Methods

| Method | Description |
|--------|-------------|
| `clearMessages()` | Clears in-memory history. |
| `getContextTokenCount()` | Returns `estimateContextTokens(messages)`. |
| `addUserMessage(content)` | Appends a user `CoreMessage`. |
| `addAssistantMessage(content)` | Appends an assistant `CoreMessage`. |
