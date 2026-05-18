# src/mcp-server.ts - Claude Code MCP Bridge

**Role:** Exposes the freecode agent as a local MCP server over stdio for Claude Code integration.

## Runtime State

| State | Description |
|-------|-------------|
| `currentProjectRoot` | Working directory used for agent tools. Defaults to server process CWD. |
| `messages` | In-memory `CoreMessage[]` history for the current MCP session. |
| `selectedModel` | Provider/model string. Defaults to `groq:llama-3.3-70b-versatile`. |
| `sessionId` | Persisted session ID from `db/client.ts`. |

## Tools

| Tool | Behavior |
|------|----------|
| `freecode_chat(message)` | Sends a user message to `agentLoop()`, appends assistant response, persists both messages, and returns text plus a metadata footer. |
| `freecode_new_project(name?)` | Creates `playground/<name-or-timestamp>`, switches CWD, clears history, and creates a new session. |
| `freecode_set_cwd(path)` | Switches to an existing absolute path, clears history, and creates a new session. |
| `freecode_clear` | Clears history while keeping CWD, creates a new session. |
| `freecode_set_model(model)` | Updates `selectedModel`. |
| `freecode_status` | Returns current model, CWD, session ID, and message count. |

## Agent Call Detail

During `freecode_chat`, stdout is temporarily suppressed because MCP uses stdout for JSON-RPC. The agent response is still captured from the returned `AgentLoopResult`.

## Imports

- MCP SDK server, stdio transport, and request schemas.
- `agentLoop` for actual agent execution.
- `createSession`, `saveMessage` for persistence.
- Node `fs/promises` and `path` for playground folders.
