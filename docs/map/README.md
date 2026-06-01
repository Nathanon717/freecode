# Codebase Map

This is the agent navigation layer for the `freecode` source tree. Use it before broad source reads to decide which files matter for a task.

The map is maintained incrementally:

1. Start from this file and the relevant area page.
2. Read source only when the map points you to files involved in the change.
3. After edits, inspect `git diff --name-only`.
4. Update only map pages for changed files whose purpose, ownership, exports, dependencies, or read/use guidance changed.
5. Update this file when source files are added, removed, renamed, or moved.

`npm run docs:generate` checks generated reference docs first. If they are current, it leaves them untouched; if they are stale, it regenerates them. It then runs `scripts/check-map.ts`, which checks that every `src/**/*.ts` file has a matching map page and that map pages still point to existing source files. It intentionally does not regenerate semantic summaries; agents keep those current from the focused diff.

Map pages should be short and operational. Prefer:

- purpose;
- read when;
- exports or entry points;
- key neighbors;
- update triggers.

Do not duplicate reference facts that belong in generated docs.

## Structure

```text
src/
|-- index.ts                      -> [CLI entry point](index.md)
|-- util/
|   |-- guards.ts                 -> [Shared type guards](util/guards.md)
|   `-- errors.ts                 -> [Error message utilities](util/errors.md)
|-- logger.ts                     -> [Diagnostic logging](logger.md)
|-- scenario-classification.ts    -> [Scenario LLM/non-LLM classifier](scenario-classification.md)
|-- agent/
|   |-- context.ts                -> [Mutable project root](agent/context.md)
|   |-- loop.ts                   -> [Agent loop](agent/loop.md)
|   |-- prompt-tools.ts           -> [Prompt-based tool harness](agent/prompt-tools.md)
|   |-- system-prompt.ts          -> [System prompt](agent/system-prompt.md)
|   |-- token-count.ts            -> [Context token estimator](agent/token-count.md)
|   `-- tools/
|       |-- index.ts              -> [Tool registry/wrappers](agent/tools/index.md)
|       |-- read-file.ts          -> [read_file](agent/tools/read-file.md)
|       |-- write-file.ts         -> [write_file](agent/tools/write-file.md)
|       |-- edit-file.ts          -> [edit_file](agent/tools/edit-file.md)
|       |-- grep.ts               -> [grep](agent/tools/grep.md)
|       |-- list-dir.ts           -> [list_dir](agent/tools/list-dir.md)
|       `-- shell.ts              -> [shell_exec](agent/tools/shell.md)
|-- cli/
|   |-- banner.ts                 -> [Startup banner](cli/banner.md)
|   |-- command-dispatcher.ts     -> [Slash command dispatch](cli/command-dispatcher.md)
|   |-- input-modes.ts            -> [Interactive/scripted input modes](cli/input-modes.md)
|   |-- raw-picker.ts             -> [Shared raw-mode picker primitive](cli/raw-picker.md)
|   |-- scenario-catalog.ts       -> [Scenario discovery/runner](cli/scenario-catalog.md)
|   |-- scenario-menu.ts          -> [Scenario menus](cli/scenario-menu.md)
|   |-- session-controller.ts     -> [Conversation/session state](cli/session-controller.md)
|   |-- preflight-input-cost.ts   -> [OpenAI live input cost controller](cli/preflight-input-cost.md)
|   |-- openai-daily-spend.ts     -> [OpenAI daily spend footer](cli/openai-daily-spend.md)
|   |-- session-runner.ts         -> [CLI session loop](cli/session-runner.md)
|   |-- slash-commands.ts         -> [Slash command list/completion](cli/slash-commands.md)
|   |-- transcript-renderer.ts    -> [Agent transcript formatting](cli/transcript-renderer.md)
|   `-- terminal-ui.ts            -> [Bottom-pinned terminal UI](cli/terminal-ui.md)
|-- commands/
|   |-- config.ts                 -> [Interactive /config editor](commands/config.md)
|   `-- model.ts                  -> [Interactive /model picker](commands/model.md)
|-- config/
|   `-- index.ts                  -> [Config loader](config/index.md)
|-- db/
|   `-- client.ts                 -> [Session storage](db/client.md)
`-- providers/
    |-- index.ts                  -> [Provider re-exports](providers/index.md)
    |-- types.ts                  -> [Provider/config types](providers/types.md)
    |-- canonical-models.ts       -> [Canonical model groups](providers/canonical-models.md)
    |-- model-sources.ts          -> [Model data sources](providers/model-sources.md)
    |-- registry.ts               -> [Provider registry](providers/registry.md)
    |-- model-traits.ts           -> [Model traits store](providers/model-traits.md)
    |-- model-cache.ts            -> [Live model list cache](providers/model-cache.md)
    |-- router.ts                 -> [Routing logic](providers/router.md)
    |-- ollama.ts                 -> [Ollama detection](providers/ollama.md)
    |-- anthropic-cost.ts         -> [Anthropic cost estimates](providers/anthropic-cost.md)
    |-- openai-cost.ts            -> [OpenAI cost estimates](providers/openai-cost.md)
    |-- pricing-verifier.ts       -> [Dual-source pricing verifier](providers/pricing-verifier.md)
    |-- adapters/
    |   |-- openai-compat.ts      -> [OpenAI-compatible adapter](providers/adapters/openai-compat.md)
    |   |-- openai-responses.ts   -> [Direct OpenAI Responses adapter](providers/adapters/openai-responses.md)
    |   `-- anthropic.ts          -> [Anthropic adapter](providers/adapters/anthropic.md)
    `-- quota/
        `-- headers.ts            -> [Provider rate-limit parsing](providers/quota/headers.md)
```

## Main Flow

Runtime starts in [index.md](index.md), enters [cli/session-runner.md](cli/session-runner.md), dispatches slash commands through [cli/command-dispatcher.md](cli/command-dispatcher.md), and sends normal turns to [agent/loop.md](agent/loop.md).

Provider selection lives in [providers/router.md](providers/router.md). Tool wrappers live under [agent/tools/](agent/tools/index.md). Scenario discovery and classification live in [cli/scenario-catalog.md](cli/scenario-catalog.md) and [scenario-classification.md](scenario-classification.md).
