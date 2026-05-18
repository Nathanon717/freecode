# Codebase Map

Hierarchical documentation of the `freecode` source tree. This map is focused on `src/` and mirrors the current module layout.

## Structure

```text
src/
|-- index.ts                      -> [CLI entry point](index.md)
|-- logger.ts                     -> [Diagnostic logging](logger.md)
|-- mcp-server.ts                 -> [Claude Code MCP bridge](mcp-server.md)
|-- scenario-classification.ts    -> [Scenario LLM/non-LLM classifier](scenario-classification.md)
|-- agent/
|   |-- context.ts                -> [Mutable project root](agent/context.md)
|   |-- loop.ts                   -> [Agent loop](agent/loop.md)
|   |-- system-prompt.ts          -> [System prompt](agent/system-prompt.md)
|   |-- token-count.ts            -> [Context token estimator](agent/token-count.md)
|   `-- tools/
|       |-- index.ts              -> [Tool registry/wrappers](agent/tools/index.md)
|       |-- read-file.ts          -> [read_file](agent/tools/read-file.md)
|       |-- write-file.ts         -> [write_file](agent/tools/write-file.md)
|       |-- grep.ts               -> [grep](agent/tools/grep.md)
|       |-- list-dir.ts           -> [list_dir](agent/tools/list-dir.md)
|       `-- shell.ts              -> [shell_exec](agent/tools/shell.md)
|-- cli/
|   |-- banner.ts                 -> [Startup banner](cli/banner.md)
|   |-- command-dispatcher.ts     -> [Slash command dispatch](cli/command-dispatcher.md)
|   |-- input-modes.ts            -> [Interactive/scripted input modes](cli/input-modes.md)
|   |-- scenario-catalog.ts       -> [Scenario discovery/runner](cli/scenario-catalog.md)
|   |-- scenario-menu.ts          -> [Scenario menus](cli/scenario-menu.md)
|   |-- session-controller.ts     -> [Conversation/session state](cli/session-controller.md)
|   |-- session-runner.ts         -> [CLI session loop](cli/session-runner.md)
|   |-- slash-commands.ts         -> [Slash command list/completion](cli/slash-commands.md)
|   `-- terminal-ui.ts            -> [Bottom-pinned terminal UI](cli/terminal-ui.md)
|-- commands/
|   `-- config.ts                 -> [Interactive /config editor](commands/config.md)
|-- config/
|   `-- index.ts                  -> [Config loader](config/index.md)
|-- db/
|   `-- client.ts                 -> [Session storage](db/client.md)
`-- providers/
    |-- index.ts                  -> [Provider re-exports](providers/index.md)
    |-- types.ts                  -> [Provider/config types](providers/types.md)
    |-- registry.ts               -> [Provider registry](providers/registry.md)
    |-- router.ts                 -> [Routing logic](providers/router.md)
    |-- ollama.ts                 -> [Ollama detection](providers/ollama.md)
    |-- adapters/
    |   `-- openai-compat.ts      -> [OpenAI-compatible adapter](providers/adapters/openai-compat.md)
    `-- quota/
        `-- headers.ts            -> [Groq rate-limit parsing](providers/quota/headers.md)
```

## Main Runtime Flow

```text
index.ts
  -> loadConfig()
  -> optionally getOllamaModels()
  -> handle --test / --test-all / --script or start interactive mode
  -> SessionController.createSession()
  -> runCliSession()
       -> mode.readInput(context token count)
       -> dispatchCommand()
            -> slash command handler, or
            -> agentLoop()
                 -> setProjectRoot()
                 -> route()
                 -> buildSystemPrompt()
                 -> streamText(... createTools(confirmToolCall) ...)
                 -> capture streamed text, token usage, optional quota headers
            -> SessionController.saveExchange()
```

## Key Concepts

- **CLI mode**: `input-modes.ts` supplies either raw TTY interaction or deterministic `--script` input.
- **Session**: `SessionController` keeps in-memory `CoreMessage[]`; `db/client.ts` persists sessions/messages to JSON.
- **Router**: `providers/router.ts` resolves a model preference or auto-selects a configured provider.
- **Provider adapter**: `providers/adapters/openai-compat.ts` wraps OpenAI-compatible APIs for the AI SDK.
- **Agent loop**: `agent/loop.ts` streams model output, enables tools only when the provider supports them, and returns metadata.
- **Tool**: Zod-validated AI SDK tool wrapped with confirmation, logging, optional rationale, tracing, and serialized execution.
- **Scenario**: JSON test script under `tests/scenarios/`; classification decides whether it belongs in `/test` or `/eval`.
