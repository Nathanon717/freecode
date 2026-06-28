# Codebase Map

This is the agent navigation layer for the `freecode` source tree. Use it before broad source reads to decide which files matter for a task.

The map is maintained incrementally:

1. Start from this file and the relevant area page.
2. Read source only when the map points you to files involved in the change.
3. After edits, run `npm run docs:generate` and inspect `git diff --name-only`.
4. Update only the hand-written prose on map pages whose purpose, ownership, dependencies, or read/use guidance changed.

The `## Exports` block on each page and the structure tree below are **generated** from source by `scripts/map-exports.ts` — do not hand-edit content between the `BEGIN/END GENERATED` markers. Refreshing signatures and adding/removing files in the tree is handled by `npm run docs:generate`; you only write the surrounding intent.

`npm run docs:generate` checks generated reference docs first. If they are current, it leaves them untouched; if they are stale, it regenerates them (including every page's exports block and this file's structure tree). It then runs `scripts/check-map.ts`, which checks that every `src/**/*.ts` file has a matching map page, that map pages still point to existing source files, and that each page keeps its generated blocks.

Map pages should be short and operational. Prefer:

- purpose;
- read when;
- export notes (intent the generated signatures cannot convey);
- key neighbors;
- update triggers.

Do not duplicate reference facts that belong in generated docs.

## Structure

<!-- BEGIN GENERATED MAP STRUCTURE -->
- `src/agent/`
  - [`context.ts`](agent/context.md) — Agent Tool Context
  - [`loop.ts`](agent/loop.md) — Agent Loop
  - [`prompt-tools.ts`](agent/prompt-tools.md) — Prompt-Based Tool Harness
  - [`session-controller.ts`](agent/session-controller.md) — Session Controller
  - [`system-prompt.ts`](agent/system-prompt.md) — System Prompt
  - [`token-count.ts`](agent/token-count.md) — Context Token Estimator
- `src/agent/tools/`
  - [`create.ts`](agent/tools/create.md) — create Tool
  - [`edit.ts`](agent/tools/edit.md) — edit Tool
  - [`grep.ts`](agent/tools/grep.md) — grep Tool
  - [`index.ts`](agent/tools/index.md) — Tool Registry
  - [`list-dir.ts`](agent/tools/list-dir.md) — list_dir Tool
  - [`read.ts`](agent/tools/read.md) — read Tool
  - [`shell.ts`](agent/tools/shell.md) — shell_exec Tool
- `src/cli/`
  - [`action-menu.ts`](cli/action-menu.md) — Inline Action Sub-menu
  - [`banner.ts`](cli/banner.md) — Startup Banner
  - [`command-dispatcher.ts`](cli/command-dispatcher.md) — Command Dispatcher
  - [`custom-eval-menu.ts`](cli/custom-eval-menu.md) — Custom Eval Tab + Run Loop
  - [`eval-dots.ts`](cli/eval-dots.md) — Eval Status Circle Renderers
  - [`eval-menu.ts`](cli/eval-menu.md) — Unified Eval Menu
  - [`eval-screen.ts`](cli/eval-screen.md) — Eval Screen Renderers
  - [`footer-status.ts`](cli/footer-status.md) — Footer Status State and Formatters
  - [`humaneval-menu.ts`](cli/humaneval-menu.md) — HumanEval Tab + Run Loop
  - [`input-buffer.ts`](cli/input-buffer.md) — Input Buffer State
  - [`list-menu.ts`](cli/list-menu.md) — Shared Tabbed List Menu
  - [`markdown-renderer.ts`](cli/markdown-renderer.md) — Markdown Renderer
  - [`menu-shell.ts`](cli/menu-shell.md) — Menu Lifecycle Chrome
  - [`model-screen.ts`](cli/model-screen.md) — Model Picker Screen Renderers
  - [`raw-picker.ts`](cli/raw-picker.md) — Shared Raw-Mode Picker
  - [`session-modes.ts`](cli/session-modes.md) — Session Modes
  - [`session-runner.ts`](cli/session-runner.md) — CLI Session Loop
  - [`slash-commands.ts`](cli/slash-commands.md) — Slash Commands
  - [`stdout-retry-sink.ts`](cli/stdout-retry-sink.md) — Non-TTY Retry Countdown Sink
  - [`terminal-ui.ts`](cli/terminal-ui.md) — Bottom Terminal UI
  - [`toggles.ts`](cli/toggles.md) — Footer Toggle State
  - [`tool-approval.ts`](cli/tool-approval.md) — Tool Approval Prompts
  - [`transcript-renderer.ts`](cli/transcript-renderer.md) — Agent Transcript Formatting
- `src/commands/`
  - [`config.ts`](commands/config.md) — Interactive Config Editor
  - [`model.ts`](commands/model.md) — Interactive Model Picker
  - [`renderer.ts`](commands/renderer.md) — Renderer Demo Command
  - [`status.ts`](commands/status.md) — /status Command
- `src/config/`
  - [`index.ts`](config/index.md) — Configuration Loader
- `src/eval/`
  - [`custom.ts`](eval/custom.md) — Custom Eval Discovery and Hashing
  - [`errors.ts`](eval/errors.md) — Eval API Error Parser
  - [`history.ts`](eval/history.md) — Eval History and Status Computation
  - [`humaneval-data.ts`](eval/humaneval-data.md) — HumanEval Dataset Loader
  - [`result-sink.ts`](eval/result-sink.md) — Eval Result JSON IPC Sink
  - [`runner.ts`](eval/runner.md) — Eval Subprocess Runner
- [`index.ts`](index.md) — CLI Entry Point
- [`logger.ts`](logger.md) — Logging Utility
- `src/providers/adapters/`
  - [`adapter-http-retry.ts`](providers/adapters/adapter-http-retry.md) — Adapter HTTP Retry/Backoff
  - [`adapter-usage-capture.ts`](providers/adapters/adapter-usage-capture.md) — Shared Usage/Header Capture
  - [`anthropic.ts`](providers/adapters/anthropic.md) — Anthropic Adapter
  - [`openai-compat-quirks.ts`](providers/adapters/openai-compat-quirks.md) — OpenAI-Compatible Provider Quirk Profiles
  - [`openai-compat-request.ts`](providers/adapters/openai-compat-request.md) — OpenAI-Compatible Request Transforms
  - [`openai-compat-sse.ts`](providers/adapters/openai-compat-sse.md) — OpenAI-Compatible SSE Transforms
  - [`openai-compat.ts`](providers/adapters/openai-compat.md) — OpenAI-Compatible Adapter
- `src/providers/`
  - [`anthropic-cost.ts`](providers/anthropic-cost.md) — Anthropic Cost Estimates
  - [`db-config-cache.ts`](providers/db-config-cache.md) — DB Config Cache
  - [`db.ts`](providers/db.md) — SQLite Store (libSQL/Turso)
  - [`fake.ts`](providers/fake.md) — Fake LLM Fixtures
  - [`index.ts`](providers/index.md) — Provider Re-exports
  - [`model-cache.ts`](providers/model-cache.md) — Model Cache
  - [`model-quirks.ts`](providers/model-quirks.md) — Per-Model Static Quirks
  - [`model-settings-registry.ts`](providers/model-settings-registry.md) — Model Settings Registry
  - [`model-store.ts`](providers/model-store.md) — Unified Model Store
  - [`openai-daily-spend.ts`](providers/openai-daily-spend.md) — OpenAI Daily Spend Footer
  - [`pricing-verifier.ts`](providers/pricing-verifier.md) — Dual-Source Pricing Verifier
- `src/providers/quota/`
  - [`cache.ts`](providers/quota/cache.md) — Quota Cache
  - [`headers.ts`](providers/quota/headers.md) — Provider Rate-Limit Header Parsing
- `src/providers/`
  - [`registry-data.ts`](providers/registry-data.md) — Provider Registry Data
  - [`registry.ts`](providers/registry.md) — Provider Registry
  - [`types.ts`](providers/types.md) — Type Definitions
- `src/util/`
  - [`errors.ts`](util/errors.md) — Shared Error Utilities
  - [`guards.ts`](util/guards.md) — Type Guard Utilities
  - [`line-diff.ts`](util/line-diff.md) — LCS Line Diff
  - [`screen-buffer.ts`](util/screen-buffer.md) — Screen Buffer
<!-- END GENERATED MAP STRUCTURE -->

## Main Flow

Runtime starts in [index.md](index.md), enters [cli/session-runner.md](cli/session-runner.md), dispatches slash commands through [cli/command-dispatcher.md](cli/command-dispatcher.md), and sends normal turns to [agent/loop.md](agent/loop.md).

Provider selection lives in [providers/registry.md](providers/registry.md). Tool wrappers live under [agent/tools/](agent/tools/index.md).
