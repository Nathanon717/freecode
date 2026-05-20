# src/mcp-server.ts - Claude Code MCP Bridge

**Role:** Exposes the freecode agent as a local MCP server over stdio for Claude Code integration.

## Read When

- Changing MCP tool registration or tool return shape.
- Debugging MCP session state, CWD switching, or message persistence.
- Changing how Anthropic cost metadata is reported through MCP.

## Agent Call Detail

During `freecode_chat`, stdout is temporarily suppressed because MCP uses stdout for JSON-RPC. The agent response is still captured from the returned `AgentLoopResult`.

The response footer includes raw provider usage JSON when usage metadata is captured.

The MCP server seeds its selected model from `config.preferredModel`; `freecode_set_model` changes only the current MCP server process selection.

`freecode_new_project`, `freecode_set_cwd`, and `freecode_clear` reset Anthropic session cost totals along with message history.

## Key Neighbors

- [agent/loop.md](agent/loop.md): executes chat turns.
- [db/client.md](db/client.md): creates sessions and stores messages.
- [providers/anthropic-cost.md](providers/anthropic-cost.md): formats cost metadata.

## Update Triggers

Update this page when MCP tools, runtime state ownership, or agent-call behavior changes.
