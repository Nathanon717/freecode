# Codebase Map

This is the agent navigation layer for the `freecode` source tree. Use it before broad source reads to decide which files matter for a task.

These docs exist purely for agent context — there is no human-facing audience. The map's whole point is token reduction: it lets an agent decide which files matter without reading them. So keep every page terse. Prose that costs more tokens than it saves defeats the purpose.

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

Format: filename (linecount)

<!-- BEGIN GENERATED MAP STRUCTURE -->
- `src/agent/`
  - [`context.ts`](agent/context.md) (72) — Agent Tool Context
  - [`loop.ts`](agent/loop.md) (501) — Agent Loop
  - [`prompt-tools.ts`](agent/prompt-tools.md) (247) — Prompt-Based Tool Harness
  - [`session-controller.ts`](agent/session-controller.md) (23) — Session Controller
  - [`system-prompt.ts`](agent/system-prompt.md) (31) — System Prompt
  - [`tool-render-gate.ts`](agent/tool-render-gate.md) (80) — Tool Render Gate
- `src/agent/tools/`
  - [`create.ts`](agent/tools/create.md) (33) — create Tool
  - [`edit.ts`](agent/tools/edit.md) (71) — edit Tool
  - [`grep.ts`](agent/tools/grep.md) (122) — grep Tool
  - [`index.ts`](agent/tools/index.md) (433) — Tool Registry
  - [`list-dir.ts`](agent/tools/list-dir.md) (45) — list_dir Tool
  - [`read.ts`](agent/tools/read.md) (87) — read Tool
  - [`shell.ts`](agent/tools/shell.md) (52) — shell_exec Tool
- `src/cli/`
  - [`action-menu.ts`](cli/action-menu.md) (53) — Inline Action Sub-menu
  - [`banner.ts`](cli/banner.md) (123) — Startup Banner
  - [`command-dispatcher.ts`](cli/command-dispatcher.md) (229) — Command Dispatcher
  - [`custom-eval-menu.ts`](cli/custom-eval-menu.md) (363) — Custom Eval Tab + Run Loop
  - [`eval-dots.ts`](cli/eval-dots.md) (28) — Eval Status Circle Renderers
  - [`eval-menu.ts`](cli/eval-menu.md) (125) — Unified Eval Menu
  - [`eval-screen.ts`](cli/eval-screen.md) (162) — Eval Screen Renderers
  - [`footer-status.ts`](cli/footer-status.md) (209) — Footer Status State and Formatters
  - [`humaneval-menu.ts`](cli/humaneval-menu.md) (324) — HumanEval Tab + Run Loop
  - [`input-buffer.ts`](cli/input-buffer.md) (109) — Input Buffer State
  - [`list-menu.ts`](cli/list-menu.md) (367) — Shared Tabbed List Menu
  - [`markdown-renderer.ts`](cli/markdown-renderer.md) (359) — Markdown Renderer
  - [`menu-shell.ts`](cli/menu-shell.md) (47) — Menu Lifecycle Chrome
  - [`model-screen.ts`](cli/model-screen.md) (204) — Model Picker Screen Renderers
  - [`raw-picker.ts`](cli/raw-picker.md) (240) — Shared Raw-Mode Picker
  - [`session-modes.ts`](cli/session-modes.md) (422) — Session Modes
  - [`session-runner.ts`](cli/session-runner.md) (75) — CLI Session Loop
  - [`slash-commands.ts`](cli/slash-commands.md) (64) — Slash Commands
  - [`stdout-retry-sink.ts`](cli/stdout-retry-sink.md) (34) — Non-TTY Retry Countdown Sink
  - [`terminal-ui.ts`](cli/terminal-ui.md) (473) — Bottom Terminal UI
  - [`toggles.ts`](cli/toggles.md) (96) — Footer Toggle State
  - [`tool-approval.ts`](cli/tool-approval.md) (311) — Tool Approval Prompts
  - [`transcript-renderer.ts`](cli/transcript-renderer.md) (457) — Agent Transcript Formatting
- `src/commands/`
  - [`config.ts`](commands/config.md) (345) — Interactive Config Editor
  - [`model.ts`](commands/model.md) (298) — Interactive Model Picker
  - [`renderer.ts`](commands/renderer.md) (249) — Renderer Demo Command
  - [`status.ts`](commands/status.md) (52) — /status Command
- `src/config/`
  - [`index.ts`](config/index.md) (219) — Configuration Loader
- `src/eval/`
  - [`custom.ts`](eval/custom.md) (96) — Custom Eval Discovery and Hashing
  - [`errors.ts`](eval/errors.md) (77) — Eval API Error Parser
  - [`history.ts`](eval/history.md) (114) — Eval History and Status Computation
  - [`humaneval-data.ts`](eval/humaneval-data.md) (99) — HumanEval Dataset Loader
  - [`result-sink.ts`](eval/result-sink.md) (79) — Eval Result JSON IPC Sink
  - [`runner.ts`](eval/runner.md) (203) — Eval Subprocess Runner
- [`index.ts`](index.md) (175) — CLI Entry Point
- [`logger.ts`](logger.md) (53) — Logging Utility
- `src/providers/adapters/`
  - [`adapter-http-retry.ts`](providers/adapters/adapter-http-retry.md) (120) — Adapter HTTP Retry/Backoff
  - [`adapter-usage-capture.ts`](providers/adapters/adapter-usage-capture.md) (52) — Shared Usage/Header Capture
  - [`anthropic.ts`](providers/adapters/anthropic.md) (205) — Anthropic Adapter
  - [`openai-compat-quirks.ts`](providers/adapters/openai-compat-quirks.md) (54) — OpenAI-Compatible Provider Quirk Profiles
  - [`openai-compat-request.ts`](providers/adapters/openai-compat-request.md) (35) — OpenAI-Compatible Request Transforms
  - [`openai-compat-sse.ts`](providers/adapters/openai-compat-sse.md) (142) — OpenAI-Compatible SSE Transforms
  - [`openai-compat.ts`](providers/adapters/openai-compat.md) (231) — OpenAI-Compatible Adapter
- `src/providers/`
  - [`anthropic-cost.ts`](providers/anthropic-cost.md) (377) — Anthropic Cost Estimates
  - [`db-config-cache.ts`](providers/db-config-cache.md) (54) — DB Config Cache
  - [`db.ts`](providers/db.md) (499) — SQLite Store (libSQL/Turso)
  - [`fake.ts`](providers/fake.md) (424) — Fake LLM Fixtures
  - [`index.ts`](providers/index.md) (4) — Provider Re-exports
  - [`model-cache.ts`](providers/model-cache.md) (105) — Model Cache
  - [`model-quirks.ts`](providers/model-quirks.md) (38) — Per-Model Static Quirks
  - [`model-settings-registry.ts`](providers/model-settings-registry.md) (14) — Model Settings Registry
  - [`model-store.ts`](providers/model-store.md) (220) — Unified Model Store
  - [`openai-daily-spend.ts`](providers/openai-daily-spend.md) (181) — OpenAI Daily Spend Footer
  - [`pricing-verifier.ts`](providers/pricing-verifier.md) (123) — Dual-Source Pricing Verifier
- `src/providers/quota/`
  - [`cache.ts`](providers/quota/cache.md) (39) — Quota Cache
  - [`headers.ts`](providers/quota/headers.md) (370) — Provider Rate-Limit Header Parsing
- `src/providers/`
  - [`registry-data.ts`](providers/registry-data.md) (311) — Provider Registry Data
  - [`registry.ts`](providers/registry.md) (397) — Provider Registry
  - [`types.ts`](providers/types.md) (54) — Type Definitions
- `src/tokenizers/backends/`
  - [`bpe-json.ts`](tokenizers/backends/bpe-json.md) (36) — HF Fast-Tokenizer (tokenizer.json) Backend
  - [`tekken.ts`](tokenizers/backends/tekken.md) (48) — Mistral Tekken (tekken.json) Backend
  - [`tiktoken.ts`](tokenizers/backends/tiktoken.md) (43) — Tiktoken-Backed Exact Encoders
- `src/tokenizers/`
  - [`chat-format.ts`](tokenizers/chat-format.md) (42) — Shared Chat-Overhead Formula
  - [`count.ts`](tokenizers/count.md) (88) — Tokenizer Engine Public Surface
  - [`download-tokenizer.ts`](tokenizers/download-tokenizer.md) (90) — HF Tokenizer File Cache/Download
  - [`fallback-estimate.ts`](tokenizers/fallback-estimate.md) (30) — Generic Tiktoken Fallback Estimator
  - [`model-family.ts`](tokenizers/model-family.md) (112) — Tokenizer Family Resolver
- `src/util/`
  - [`errors.ts`](util/errors.md) (236) — Shared Error Utilities
  - [`guards.ts`](util/guards.md) (4) — Type Guard Utilities
  - [`keys.ts`](util/keys.md) (5) — Raw-Key Helpers
  - [`line-diff.ts`](util/line-diff.md) (39) — LCS Line Diff
  - [`screen-buffer.ts`](util/screen-buffer.md) (115) — Screen Buffer
  - [`text-encoding.ts`](util/text-encoding.md) (24) — Text Encoding Helpers
<!-- END GENERATED MAP STRUCTURE -->

## Main Flow

Runtime starts in [index.md](index.md), enters [cli/session-runner.md](cli/session-runner.md), dispatches slash commands through [cli/command-dispatcher.md](cli/command-dispatcher.md), and sends normal turns to [agent/loop.md](agent/loop.md).

Provider selection lives in [providers/registry.md](providers/registry.md). Tool wrappers live under [agent/tools/](agent/tools/index.md).
