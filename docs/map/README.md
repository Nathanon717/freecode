# Codebase Map

This is the agent navigation layer for the `freecode` source tree. Use it before broad source reads to decide which files matter for a task.

These docs exist purely for agent context — there is no human-facing audience. The map's whole point is token reduction: it lets an agent decide which files matter without reading them. So keep every page terse. Prose that costs more tokens than it saves defeats the purpose.

The map is maintained incrementally:

1. Start from this file and the relevant area page.
2. Read source only when the map points you to files involved in the change.
3. After edits, run `npm run docs:generate` and inspect `git diff --name-only`.
4. Update only the hand-written prose on map pages whose purpose, ownership, dependencies, or read/use guidance changed.

Most of a page is **generated** from source — do not hand-edit content between the `BEGIN/END GENERATED` markers. `npm run docs:generate` maintains it; you only write the surrounding intent.

| Generated section | Derived from |
| --- | --- |
| `Exports` | each export's signature and its JSDoc (`scripts/docgen/map-exports.ts`) |
| `Neighbors` | the intra-`src/` import graph, both directions (`scripts/docgen/map-facts.ts`) |
| `Tests` | the mirrored `tests/` file, plus a count of the others that name this module |
| `Budget` | lines against the 500-line limit, counted exactly as the gate counts them |
| `Env` | `process.env` reads in the source; absent when the module reads none |

**Neighbors are ranked, not listed.** `×7` weighs the edge: how many times the importing file mentions the names it imported, or for a re-export, how many names it carries across. The file a module leans on sorts above the one it touches once — salience is derived rather than curated, which is why no page carries a hand-written "why it matters" line beside an edge. Long lists are cut off with `+n more`; the withheld edges are the lightest ones.

Per-export intent goes in the export's **JSDoc**, not on the page: it is lifted into `Exports`, and it gets edited in the same diff as the code that invalidates it.

`npm run docs:generate` checks generated reference docs first. If they are current, it leaves them untouched; if they are stale, it regenerates them (including every page's generated blocks and this file's structure tree). It then runs `scripts/checks/check-map.ts`, which checks that every `src/**/*.ts` file has a matching map page, that map pages still point to existing source files, and that each page keeps its generated blocks.

What you still write by hand is the part no parser could produce: the page's `Role`, its `Read When`, and whatever tail sections the file's behavior needs. Keep it short and operational, and do not restate a fact a generated section already carries.

## Querying

`npm run map` reads pages by section instead of whole — one field across many pages, or one field from one page, without paying for the rest.

| Verb | Answers |
| --- | --- |
| `npm run map -- role <glob>` | what every page under a path is for, one line each |
| `npm run map -- exports <file>` | the generated signatures, without the prose around them |
| `npm run map -- section <name> <glob>` | any section by name — `section "read when" agent/` |
| `npm run map -- sections <file>` | what a page contains, canonical sections and one-off headings alike |
| `npm run map -- neighbors-of <file>` | which pages link to this one, and where their link text has gone stale |

`<file>` accepts `src/agent/loop.ts`, `agent/loop.md` or `agent/loop`. `<glob>` matches map-relative paths: `**` is every page, `agent/` is a directory, `*` stops at a separator. Add `--format json` for structured output.

Section names resolve through the manifest in `scripts/docgen/map-sections.ts`, which maps every spelling in the corpus to one canonical name — `Key Neighbors`, `Key neighbours` and `Neighbors` all answer to `Neighbors`, and an inline `**Read when:**` answers the same as `## Read When`. That array is the single definition of map structure.

## Structure

Format: filename (linecount)

<!-- BEGIN GENERATED MAP STRUCTURE -->
- `src/agent/`
  - [`conversation.ts`](agent/conversation.md) (59) — Session Controller
  - [`fake-loop.ts`](agent/fake-loop.md) (129) — Fake-Fixture Turn Loop
  - [`loop.ts`](agent/loop.md) (467) — Agent Loop
  - [`parsed-tools.ts`](agent/parsed-tools.md) (297) — Parsed-Tools Harness
  - [`stream-turn.ts`](agent/stream-turn.md) (127) — Recovering Stream Turn
- `src/agent/subagents/`
  - [`registry.ts`](agent/subagents/registry.md) (55) — Sub-Agent Registry
  - [`run-subagent.ts`](agent/subagents/run-subagent.md) (160) — Sub-Agent Runner
- `src/agent/`
  - [`system-prompt.ts`](agent/system-prompt.md) (68) — System Prompt
  - [`tool-render-gate.ts`](agent/tool-render-gate.md) (79) — Tool Render Gate
- `src/agent/tools/`
  - [`create.ts`](agent/tools/create.md) (32) — create Tool
  - [`edit-diff-context.ts`](agent/tools/edit-diff-context.md) (102) — Edit Diff Context
  - [`edit.ts`](agent/tools/edit.md) (70) — edit Tool
  - [`grep.ts`](agent/tools/grep.md) (323) — grep Tool
  - [`index.ts`](agent/tools/index.md) (102) — Tool Registry
  - [`list-dir.ts`](agent/tools/list-dir.md) (44) — list_dir Tool
  - [`read.ts`](agent/tools/read.md) (87) — read Tool
  - [`shell.ts`](agent/tools/shell.md) (129) — shell_exec Tool
  - [`spawn-agent.ts`](agent/tools/spawn-agent.md) (37) — spawn_agent Tool
  - [`tool-names.ts`](agent/tools/tool-names.md) (64) — Tool Name Partition
  - [`wrappers.ts`](agent/tools/wrappers.md) (494) — Tool Wrapper Stack
- `src/agent/`
  - [`turn-messages.ts`](agent/turn-messages.md) (194) — Turn Message Shape Rules
  - [`usage-finalize.ts`](agent/usage-finalize.md) (41) — Turn Usage/Quota Finalization
  - [`workspace.ts`](agent/workspace.md) (71) — Agent Tool Context
- `src/cli/chrome/`
  - [`ansi.ts`](cli/chrome/ansi.md) (55) — Terminal Geometry & Escape Sequences
  - [`bottom-ui.ts`](cli/chrome/bottom-ui.md) (485) — Bottom Terminal UI
  - [`footer-status.ts`](cli/chrome/footer-status.md) (214) — Footer Status State and Formatters
  - [`input-buffer.ts`](cli/chrome/input-buffer.md) (114) — Input Buffer State
  - [`suggestion-overlay.ts`](cli/chrome/suggestion-overlay.md) (57) — Suggestion Overlay Snapshot
  - [`toggles.ts`](cli/chrome/toggles.md) (105) — Footer Toggle State
  - [`turn-state.ts`](cli/chrome/turn-state.md) (82) — Agent-Turn UI State
- `src/cli/`
  - [`command-dispatcher.ts`](cli/command-dispatcher.md) (259) — Command Dispatcher
- `src/cli/eval/`
  - [`custom-eval-menu.ts`](cli/eval/custom-eval-menu.md) (360) — Custom Eval Tab + Run Loop
  - [`eval-dots.ts`](cli/eval/eval-dots.md) (28) — Eval Status Circle Renderers
  - [`eval-menu.ts`](cli/eval/eval-menu.md) (122) — Unified Eval Menu
  - [`eval-screen.ts`](cli/eval/eval-screen.md) (165) — Eval Screen Renderers
  - [`humaneval-menu.ts`](cli/eval/humaneval-menu.md) (313) — HumanEval Tab + Run Loop
- `src/cli/`
  - [`headless-prompt.ts`](cli/headless-prompt.md) (152) — Headless Prompt Mode (`-p`)
- `src/cli/menus/`
  - [`action-menu.ts`](cli/menus/action-menu.md) (52) — Inline Action Sub-menu
  - [`list-menu.ts`](cli/menus/list-menu.md) (364) — Shared Tabbed List Menu
  - [`menu-shell.ts`](cli/menus/menu-shell.md) (46) — Menu Lifecycle Chrome
  - [`model-screen.ts`](cli/menus/model-screen.md) (235) — Model Picker Screen Renderers
  - [`raw-picker.ts`](cli/menus/raw-picker.md) (240) — Shared Raw-Mode Picker
- `src/cli/render/`
  - [`banner.ts`](cli/render/banner.md) (123) — Startup Banner
  - [`markdown-renderer.ts`](cli/render/markdown-renderer.md) (489) — Markdown Renderer
  - [`transcript-format.ts`](cli/render/transcript-format.md) (191) — Transcript Formatters
  - [`transcript-options.ts`](cli/render/transcript-options.md) (70) — Transcript Stream + Options
  - [`transcript-record.ts`](cli/render/transcript-record.md) (150) — Rendered Transcript Record
  - [`transcript-renderer.ts`](cli/render/transcript-renderer.md) (398) — Agent Transcript Formatting
  - [`transcript-replay.ts`](cli/render/transcript-replay.md) (78) — Post-Wipe Transcript Replay
- `src/cli/`
  - [`scripted-mode.ts`](cli/scripted-mode.md) (95) — Scripted Session Mode
  - [`session-modes.ts`](cli/session-modes.md) (446) — Session Modes
  - [`session-runner.ts`](cli/session-runner.md) (76) — CLI Session Loop
  - [`slash-commands.ts`](cli/slash-commands.md) (75) — Slash Commands
  - [`stdout-retry-sink.ts`](cli/stdout-retry-sink.md) (33) — Non-TTY Retry Countdown Sink
  - [`theme.ts`](cli/theme.md) (58) — Color Tokens
- `src/cli/tools/`
  - [`tool-approval.ts`](cli/tools/tool-approval.md) (303) — Tool Approval Prompts
  - [`tool-invocation.ts`](cli/tools/tool-invocation.md) (323) — Hand-Typed Tool Call Parsing
  - [`tool-runner.ts`](cli/tools/tool-runner.md) (103) — Hand-Typed Tool Execution + /tools Listing
- `src/commands/`
  - [`config.ts`](commands/config.md) (396) — Interactive Config Editor
  - [`model.ts`](commands/model.md) (385) — Interactive Model Picker
  - [`renderer.ts`](commands/renderer.md) (283) — Renderer Demo Command
  - [`status.ts`](commands/status.md) (51) — /status Command
- `src/config/`
  - [`index.ts`](config/index.md) (244) — Configuration Loader
- `src/eval/`
  - [`custom.ts`](eval/custom.md) (95) — Custom Eval Discovery and Hashing
  - [`errors.ts`](eval/errors.md) (76) — Eval API Error Parser
  - [`history.ts`](eval/history.md) (113) — Eval History and Status Computation
  - [`humaneval-data.ts`](eval/humaneval-data.md) (98) — HumanEval Dataset Loader
  - [`result-sink.ts`](eval/result-sink.md) (78) — Eval Result JSON IPC Sink
  - [`runner.ts`](eval/runner.md) (201) — Eval Subprocess Runner
- [`index.ts`](index.md) (227) — CLI Entry Point
- [`logger.ts`](logger.md) (52) — Logging Utility
- `src/providers/adapters/`
  - [`adapter-http-retry.ts`](providers/adapters/adapter-http-retry.md) (188) — Adapter HTTP Retry/Backoff
  - [`adapter-usage-capture.ts`](providers/adapters/adapter-usage-capture.md) (51) — Shared Usage/Header Capture
  - [`openai-compat-quirks.ts`](providers/adapters/openai-compat-quirks.md) (64) — OpenAI-Compatible Provider Quirk Profiles
  - [`openai-compat-request.ts`](providers/adapters/openai-compat-request.md) (69) — OpenAI-Compatible Request Transforms
  - [`openai-compat-sse.ts`](providers/adapters/openai-compat-sse.md) (141) — OpenAI-Compatible SSE Transforms
  - [`openai-compat.ts`](providers/adapters/openai-compat.md) (254) — OpenAI-Compatible Adapter
- `src/providers/`
  - [`fake.ts`](providers/fake.md) (434) — Fake LLM Fixtures
  - [`index.ts`](providers/index.md) (3) — Provider Re-exports
  - [`model-data.ts`](providers/model-data.md) (278) — Unified Model Store
  - [`model-quirks.ts`](providers/model-quirks.md) (37) — Per-Model Static Quirks
  - [`model-settings-accessor.ts`](providers/model-settings-accessor.md) (13) — Model Settings Accessor
  - [`openai-daily-spend.ts`](providers/openai-daily-spend.md) (180) — OpenAI Daily Spend Footer
  - [`paid-guard.ts`](providers/paid-guard.md) (59) — Free-Only Hard Block
  - [`pricing-verifier.ts`](providers/pricing-verifier.md) (122) — Dual-Source Pricing Verifier
  - [`provider-catalog.ts`](providers/provider-catalog.md) (330) — Provider Catalog
  - [`provider-registry.ts`](providers/provider-registry.md) (455) — Provider Registry
- `src/providers/quota/`
  - [`cache.ts`](providers/quota/cache.md) (38) — Quota Cache
  - [`headers.ts`](providers/quota/headers.md) (249) — Provider Rate-Limit Header Parsing
- `src/providers/`
  - [`types.ts`](providers/types.md) (63) — Type Definitions
  - [`user-blocklist.ts`](providers/user-blocklist.md) (68) — Per-User Model Blocklist
- `src/store/`
  - [`call-log.ts`](store/call-log.md) (51) — Per-Call LLM Log
  - [`db-config-cache.ts`](store/db-config-cache.md) (54) — DB Config Cache
  - [`db-load.ts`](store/db-load.md) (87) — DB Row Hydration
  - [`db-schema.ts`](store/db-schema.md) (86) — Table & Index DDL
  - [`db-types.ts`](store/db-types.md) (5) — Shared Store Types
  - [`db.ts`](store/db.md) (484) — SQLite Store (libSQL/Turso)
  - [`model-list-cache.ts`](store/model-list-cache.md) (106) — Model List Cache
  - [`store-paths.ts`](store/store-paths.md) (49) — Store Location & Sync Credentials
- `src/tokenizers/backends/`
  - [`bpe-json.ts`](tokenizers/backends/bpe-json.md) (33) — HF Fast-Tokenizer (tokenizer.json) Backend
  - [`tekken.ts`](tokenizers/backends/tekken.md) (47) — Mistral Tekken (tekken.json) Backend
  - [`tiktoken.ts`](tokenizers/backends/tiktoken.md) (42) — Tiktoken-Backed Exact Encoders
- `src/tokenizers/`
  - [`chat-format.ts`](tokenizers/chat-format.md) (41) — Shared Chat-Overhead Formula
  - [`count.ts`](tokenizers/count.md) (108) — Tokenizer Engine Public Surface
  - [`download-tokenizer.ts`](tokenizers/download-tokenizer.md) (89) — HF Tokenizer File Cache/Download
  - [`fallback-estimate.ts`](tokenizers/fallback-estimate.md) (29) — Generic Tiktoken Fallback Estimator
  - [`model-family.ts`](tokenizers/model-family.md) (133) — Tokenizer Family Resolver
- `src/util/`
  - [`errors.ts`](util/errors.md) (316) — Shared Error Utilities
  - [`guards.ts`](util/guards.md) (3) — Type Guard Utilities
  - [`keyboard.ts`](util/keyboard.md) (4) — Raw-Key Helpers
  - [`line-diff.ts`](util/line-diff.md) (38) — LCS Line Diff
  - [`line-numbers.ts`](util/line-numbers.md) (13) — Line-Number Gutter
  - [`screen-buffer.ts`](util/screen-buffer.md) (192) — Screen Buffer
  - [`text-encoding.ts`](util/text-encoding.md) (23) — Text Encoding Helpers
  - [`wrap-rows.ts`](util/wrap-rows.md) (48) — Wrapped-Row Math
<!-- END GENERATED MAP STRUCTURE -->

## Main Flow

Runtime starts in [index.md](index.md), enters [cli/session-runner.md](cli/session-runner.md), dispatches slash commands through [cli/command-dispatcher.md](cli/command-dispatcher.md), and sends normal turns to [agent/loop.md](agent/loop.md).

Provider selection lives in [providers/provider-registry.md](providers/provider-registry.md). Tool wrappers live under [agent/tools/](agent/tools/index.md).
