# Codebase Map

This is the agent navigation layer for the `freecode` source tree. Use it before broad source reads to decide which files matter for a task.

These docs exist purely for agent context — there is no human-facing audience. The map's whole point is token reduction: it lets an agent decide which files matter without reading them. So keep every page terse. Prose that costs more tokens than it saves defeats the purpose.

The map is maintained incrementally:

1. Start from this file and the relevant area page.
2. Read source only when the map points you to files involved in the change.
3. After edits, run `npm run docs:generate` and inspect `git diff --name-only`.
4. Update only the hand-written prose on map pages whose purpose, ownership, dependencies, or read/use guidance changed.

The `## Exports` block on each page and the structure tree below are **generated** from source by `scripts/docgen/map-exports.ts` — do not hand-edit content between the `BEGIN/END GENERATED` markers. Refreshing signatures and adding/removing files in the tree is handled by `npm run docs:generate`; you only write the surrounding intent.

`npm run docs:generate` checks generated reference docs first. If they are current, it leaves them untouched; if they are stale, it regenerates them (including every page's exports block and this file's structure tree). It then runs `scripts/checks/check-map.ts`, which checks that every `src/**/*.ts` file has a matching map page, that map pages still point to existing source files, and that each page keeps its generated blocks.

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
  - [`conversation.ts`](agent/conversation.md) (31) — Session Controller
  - [`loop.ts`](agent/loop.md) (457) — Agent Loop
  - [`parsed-tools.ts`](agent/parsed-tools.md) (247) — Parsed-Tools Harness
  - [`system-prompt.ts`](agent/system-prompt.md) (31) — System Prompt
  - [`tool-render-gate.ts`](agent/tool-render-gate.md) (80) — Tool Render Gate
- `src/agent/tools/`
  - [`create.ts`](agent/tools/create.md) (33) — create Tool
  - [`edit-diff-context.ts`](agent/tools/edit-diff-context.md) (103) — Edit Diff Context
  - [`edit.ts`](agent/tools/edit.md) (71) — edit Tool
  - [`grep.ts`](agent/tools/grep.md) (122) — grep Tool
  - [`index.ts`](agent/tools/index.md) (428) — Tool Registry
  - [`list-dir.ts`](agent/tools/list-dir.md) (45) — list_dir Tool
  - [`read.ts`](agent/tools/read.md) (88) — read Tool
  - [`shell.ts`](agent/tools/shell.md) (52) — shell_exec Tool
- `src/agent/`
  - [`usage-finalize.ts`](agent/usage-finalize.md) (65) — Turn Usage/Cost/Quota Finalization
  - [`workspace.ts`](agent/workspace.md) (72) — Agent Tool Context
- `src/cli/`
  - [`blocklist-purge-prompt.ts`](cli/blocklist-purge-prompt.md) (82) — Startup Blocklist Purge Confirmation
- `src/cli/chrome/`
  - [`bottom-ui.ts`](cli/chrome/bottom-ui.md) (477) — Bottom Terminal UI
  - [`footer-status.ts`](cli/chrome/footer-status.md) (215) — Footer Status State and Formatters
  - [`input-buffer.ts`](cli/chrome/input-buffer.md) (115) — Input Buffer State
  - [`toggles.ts`](cli/chrome/toggles.md) (100) — Footer Toggle State
- `src/cli/`
  - [`command-dispatcher.ts`](cli/command-dispatcher.md) (243) — Command Dispatcher
- `src/cli/eval/`
  - [`custom-eval-menu.ts`](cli/eval/custom-eval-menu.md) (361) — Custom Eval Tab + Run Loop
  - [`eval-dots.ts`](cli/eval/eval-dots.md) (28) — Eval Status Circle Renderers
  - [`eval-menu.ts`](cli/eval/eval-menu.md) (123) — Unified Eval Menu
  - [`eval-screen.ts`](cli/eval/eval-screen.md) (165) — Eval Screen Renderers
  - [`humaneval-menu.ts`](cli/eval/humaneval-menu.md) (314) — HumanEval Tab + Run Loop
- `src/cli/menus/`
  - [`action-menu.ts`](cli/menus/action-menu.md) (53) — Inline Action Sub-menu
  - [`list-menu.ts`](cli/menus/list-menu.md) (367) — Shared Tabbed List Menu
  - [`menu-shell.ts`](cli/menus/menu-shell.md) (47) — Menu Lifecycle Chrome
  - [`model-screen.ts`](cli/menus/model-screen.md) (236) — Model Picker Screen Renderers
  - [`raw-picker.ts`](cli/menus/raw-picker.md) (240) — Shared Raw-Mode Picker
- `src/cli/render/`
  - [`banner.ts`](cli/render/banner.md) (123) — Startup Banner
  - [`markdown-renderer.ts`](cli/render/markdown-renderer.md) (480) — Markdown Renderer
  - [`transcript-options.ts`](cli/render/transcript-options.md) (66) — Transcript Stream + Options
  - [`transcript-renderer.ts`](cli/render/transcript-renderer.md) (486) — Agent Transcript Formatting
- `src/cli/`
  - [`scripted-mode.ts`](cli/scripted-mode.md) (96) — Scripted Session Mode
  - [`session-modes.ts`](cli/session-modes.md) (416) — Session Modes
  - [`session-runner.ts`](cli/session-runner.md) (75) — CLI Session Loop
  - [`slash-commands.ts`](cli/slash-commands.md) (65) — Slash Commands
  - [`stdout-retry-sink.ts`](cli/stdout-retry-sink.md) (34) — Non-TTY Retry Countdown Sink
- `src/cli/tools/`
  - [`tool-approval.ts`](cli/tools/tool-approval.md) (297) — Tool Approval Prompts
  - [`tool-invocation.ts`](cli/tools/tool-invocation.md) (334) — Hand-Typed Tool Call Parsing
  - [`tool-runner.ts`](cli/tools/tool-runner.md) (100) — Hand-Typed Tool Execution + /tools Listing
- `src/commands/`
  - [`config.ts`](commands/config.md) (397) — Interactive Config Editor
  - [`model.ts`](commands/model.md) (389) — Interactive Model Picker
  - [`renderer.ts`](commands/renderer.md) (284) — Renderer Demo Command
  - [`status.ts`](commands/status.md) (52) — /status Command
- `src/config/`
  - [`index.ts`](config/index.md) (239) — Configuration Loader
- `src/eval/`
  - [`custom.ts`](eval/custom.md) (96) — Custom Eval Discovery and Hashing
  - [`errors.ts`](eval/errors.md) (77) — Eval API Error Parser
  - [`history.ts`](eval/history.md) (114) — Eval History and Status Computation
  - [`humaneval-data.ts`](eval/humaneval-data.md) (99) — HumanEval Dataset Loader
  - [`result-sink.ts`](eval/result-sink.md) (79) — Eval Result JSON IPC Sink
  - [`runner.ts`](eval/runner.md) (203) — Eval Subprocess Runner
- [`index.ts`](index.md) (186) — CLI Entry Point
- [`logger.ts`](logger.md) (53) — Logging Utility
- `src/providers/adapters/`
  - [`adapter-http-retry.ts`](providers/adapters/adapter-http-retry.md) (120) — Adapter HTTP Retry/Backoff
  - [`adapter-usage-capture.ts`](providers/adapters/adapter-usage-capture.md) (52) — Shared Usage/Header Capture
  - [`anthropic.ts`](providers/adapters/anthropic.md) (238) — Anthropic Adapter
  - [`openai-compat-quirks.ts`](providers/adapters/openai-compat-quirks.md) (54) — OpenAI-Compatible Provider Quirk Profiles
  - [`openai-compat-request.ts`](providers/adapters/openai-compat-request.md) (35) — OpenAI-Compatible Request Transforms
  - [`openai-compat-sse.ts`](providers/adapters/openai-compat-sse.md) (142) — OpenAI-Compatible SSE Transforms
  - [`openai-compat.ts`](providers/adapters/openai-compat.md) (254) — OpenAI-Compatible Adapter
- `src/providers/`
  - [`anthropic-cost.ts`](providers/anthropic-cost.md) (281) — Anthropic Cost Estimates
  - [`blocklist-purge.ts`](providers/blocklist-purge.md) (61) — Blocklisted Stored Model Purge
  - [`fake.ts`](providers/fake.md) (420) — Fake LLM Fixtures
  - [`index.ts`](providers/index.md) (4) — Provider Re-exports
  - [`model-data.ts`](providers/model-data.md) (279) — Unified Model Store
  - [`model-quirks.ts`](providers/model-quirks.md) (38) — Per-Model Static Quirks
  - [`model-settings-accessor.ts`](providers/model-settings-accessor.md) (14) — Model Settings Accessor
  - [`openai-daily-spend.ts`](providers/openai-daily-spend.md) (181) — OpenAI Daily Spend Footer
  - [`pricing-verifier.ts`](providers/pricing-verifier.md) (123) — Dual-Source Pricing Verifier
  - [`provider-catalog.ts`](providers/provider-catalog.md) (311) — Provider Catalog
  - [`provider-registry.ts`](providers/provider-registry.md) (457) — Provider Registry
- `src/providers/quota/`
  - [`cache.ts`](providers/quota/cache.md) (39) — Quota Cache
  - [`headers.ts`](providers/quota/headers.md) (370) — Provider Rate-Limit Header Parsing
- `src/providers/`
  - [`types.ts`](providers/types.md) (57) — Type Definitions
  - [`user-blocklist.ts`](providers/user-blocklist.md) (69) — Per-User Model Blocklist
- `src/store/`
  - [`call-log.ts`](store/call-log.md) (53) — Per-Call LLM Log
  - [`db-config-cache.ts`](store/db-config-cache.md) (55) — DB Config Cache
  - [`db-load.ts`](store/db-load.md) (88) — DB Row Hydration
  - [`db-schema.ts`](store/db-schema.md) (87) — Table & Index DDL
  - [`db-types.ts`](store/db-types.md) (6) — Shared Store Types
  - [`db.ts`](store/db.md) (458) — SQLite Store (libSQL/Turso)
  - [`model-list-cache.ts`](store/model-list-cache.md) (107) — Model List Cache
  - [`store-paths.ts`](store/store-paths.md) (50) — Store Location & Sync Credentials
- `src/tokenizers/backends/`
  - [`bpe-json.ts`](tokenizers/backends/bpe-json.md) (34) — HF Fast-Tokenizer (tokenizer.json) Backend
  - [`tekken.ts`](tokenizers/backends/tekken.md) (48) — Mistral Tekken (tekken.json) Backend
  - [`tiktoken.ts`](tokenizers/backends/tiktoken.md) (43) — Tiktoken-Backed Exact Encoders
- `src/tokenizers/`
  - [`chat-format.ts`](tokenizers/chat-format.md) (42) — Shared Chat-Overhead Formula
  - [`count.ts`](tokenizers/count.md) (109) — Tokenizer Engine Public Surface
  - [`download-tokenizer.ts`](tokenizers/download-tokenizer.md) (90) — HF Tokenizer File Cache/Download
  - [`fallback-estimate.ts`](tokenizers/fallback-estimate.md) (30) — Generic Tiktoken Fallback Estimator
  - [`model-family.ts`](tokenizers/model-family.md) (112) — Tokenizer Family Resolver
- `src/util/`
  - [`errors.ts`](util/errors.md) (236) — Shared Error Utilities
  - [`guards.ts`](util/guards.md) (4) — Type Guard Utilities
  - [`keyboard.ts`](util/keyboard.md) (5) — Raw-Key Helpers
  - [`line-diff.ts`](util/line-diff.md) (39) — LCS Line Diff
  - [`line-numbers.ts`](util/line-numbers.md) (14) — Line-Number Gutter
  - [`screen-buffer.ts`](util/screen-buffer.md) (95) — Screen Buffer
  - [`text-encoding.ts`](util/text-encoding.md) (24) — Text Encoding Helpers
  - [`wrap-rows.ts`](util/wrap-rows.md) (49) — Wrapped-Row Math
<!-- END GENERATED MAP STRUCTURE -->

## Main Flow

Runtime starts in [index.md](index.md), enters [cli/session-runner.md](cli/session-runner.md), dispatches slash commands through [cli/command-dispatcher.md](cli/command-dispatcher.md), and sends normal turns to [agent/loop.md](agent/loop.md).

Provider selection lives in [providers/provider-registry.md](providers/provider-registry.md). Tool wrappers live under [agent/tools/](agent/tools/index.md).
