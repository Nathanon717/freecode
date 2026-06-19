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
|   |-- errors.ts                 -> [Error message utilities](util/errors.md)
|   `-- screen-buffer.ts          -> [Stdout ring buffer](util/screen-buffer.md)
|-- logger.ts                     -> [Diagnostic logging](logger.md)
|-- agent/
|   |-- context.ts                -> [Mutable project root](agent/context.md)
|   |-- loop.ts                   -> [Agent loop](agent/loop.md)
|   |-- prompt-tools.ts           -> [Prompt-based tool harness](agent/prompt-tools.md)
|   |-- system-prompt.ts          -> [System prompt](agent/system-prompt.md)
|   |-- token-count.ts            -> [Context token estimator](agent/token-count.md)
|   `-- tools/
|       |-- index.ts              -> [Tool registry/wrappers](agent/tools/index.md)
|       |-- read.ts              -> [read](agent/tools/read.md)
|       |-- create.ts             -> [create](agent/tools/create.md)
|       |-- edit.ts              -> [edit](agent/tools/edit.md)
|       |-- grep.ts               -> [grep](agent/tools/grep.md)
|       |-- list-dir.ts           -> [list_dir](agent/tools/list-dir.md)
|       `-- shell.ts              -> [shell_exec](agent/tools/shell.md)
|-- cli/
|   |-- banner.ts                 -> [Startup banner](cli/banner.md)
|   |-- command-dispatcher.ts     -> [Slash command dispatch](cli/command-dispatcher.md)
|   |-- input-modes.ts            -> [Interactive/scripted input modes](cli/input-modes.md)
|   |-- input-buffer.ts           -> [Input buffer and cursor state](cli/input-buffer.md)
|   |-- tool-approval.ts          -> [Tool approval prompts](cli/tool-approval.md)
|   |-- raw-picker.ts             -> [Shared raw-mode picker primitive](cli/raw-picker.md)
|   |-- action-menu.ts            -> [Inline action sub-menu](cli/action-menu.md)
|   |-- footer-status.ts          -> [Footer status state and formatters](cli/footer-status.md)
|   |-- eval-dots.ts              -> [Eval status circle utilities](cli/eval-dots.md)
|   |-- eval-errors.ts            -> [Eval API error parser](cli/eval-errors.md)
|   |-- eval-runner.ts            -> [Eval subprocess runner](cli/eval-runner.md)
|   |-- eval-screen.ts            -> [Eval screen renderers](cli/eval-screen.md)
|   |-- scenario-catalog.ts       -> [Scenario discovery/runner](cli/scenario-catalog.md)
|   |-- scenario-menu.ts          -> [Scenario menus](cli/scenario-menu.md)
|   |-- session-controller.ts     -> [In-memory conversation state](cli/session-controller.md)
|   |-- openai-daily-spend.ts     -> [OpenAI daily spend footer](cli/openai-daily-spend.md)
|   |-- session-runner.ts         -> [CLI session loop](cli/session-runner.md)
|   |-- slash-commands.ts         -> [Slash command list/completion](cli/slash-commands.md)
|   |-- transcript-renderer.ts    -> [Agent transcript formatting](cli/transcript-renderer.md)
|   |-- markdown-renderer.ts      -> [Markdown renderer for LLM output](cli/markdown-renderer.md)
|   |-- terminal-ui.ts            -> [Bottom-pinned terminal UI](cli/terminal-ui.md)
|   `-- toggles.ts                -> [Footer toggle state](cli/toggles.md)
|-- commands/
|   |-- config.ts                 -> [Interactive /config editor](commands/config.md)
|   |-- humaneval.ts              -> [/humaneval benchmark command](commands/humaneval.md)
|   |-- model.ts                  -> [Interactive /model picker](commands/model.md)
|   |-- renderer.ts               -> [/renderer demo command](commands/renderer.md)
|   `-- status.ts                 -> [/status system status](commands/status.md)
|-- config/
|   `-- index.ts                  -> [Config loader](config/index.md)
`-- providers/
    |-- index.ts                  -> [Provider re-exports](providers/index.md)
    |-- types.ts                  -> [Provider/config types](providers/types.md)
    |-- fake.ts                   -> [Fake LLM fixtures](providers/fake.md)
    |-- registry.ts               -> [Provider registry](providers/registry.md)
    |-- registry-data.ts          -> [Provider registry data](providers/registry-data.md)
    |-- db.ts                     -> [SQLite store / libSQL client](providers/db.md)
    |-- store-import.ts           -> [Legacy JSON → DB importer](providers/store-import.md)
    |-- model-store.ts            -> [Unified model store](providers/model-store.md)
    |-- model-cache.ts            -> [Live model list cache](providers/model-cache.md)
    |-- anthropic-cost.ts         -> [Anthropic cost estimates](providers/anthropic-cost.md)
    |-- pricing-verifier.ts       -> [Dual-source pricing verifier](providers/pricing-verifier.md)
    |-- adapters/
    |   |-- openai-compat.ts      -> [OpenAI-compatible adapter](providers/adapters/openai-compat.md)
    |   `-- anthropic.ts          -> [Anthropic adapter](providers/adapters/anthropic.md)
    `-- quota/
        |-- headers.ts            -> [Provider rate-limit parsing](providers/quota/headers.md)
        `-- cache.ts              -> [Quota disk cache](providers/quota/cache.md)
```

## Main Flow

Runtime starts in [index.md](index.md), enters [cli/session-runner.md](cli/session-runner.md), dispatches slash commands through [cli/command-dispatcher.md](cli/command-dispatcher.md), and sends normal turns to [agent/loop.md](agent/loop.md).

Provider selection lives in [providers/registry.md](providers/registry.md). Tool wrappers live under [agent/tools/](agent/tools/index.md). Scenario discovery lives in [cli/scenario-catalog.md](cli/scenario-catalog.md).
