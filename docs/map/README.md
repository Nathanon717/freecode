# Codebase Map

This is the agent navigation layer for the `freecode` source tree. Use it before broad source reads to decide which files matter for a task.

These docs exist purely for agent context — there is no human-facing audience. The map's whole point is token reduction: it lets an agent decide which files matter without reading them. So keep every page terse. Prose that costs more tokens than it saves defeats the purpose.

The map is maintained incrementally:

1. Start from this file and the relevant area page.
2. Read source only when the map points you to files involved in the change.
3. After edits, run `npm run docs:generate` and inspect `git diff --name-only`.
4. Update the intent where it lives: a module whose purpose or read/use guidance changed needs its `@role` / `@readwhen` edited **in the source file**, not on the page. Only the page's tail sections are edited on the page.

## Page shape

Every page is the same shape: a generated head in a fixed order, then one authored tail.

```text
# src/agent/loop.ts — Agent Loop     AUTHORED   (source path + a short label)
## Role                              GENERATED  (from @role in source)
## Read When                         GENERATED  (from @readwhen in source)
## Exports                           GENERATED  (+ JSDoc, + external ref counts)
## Neighbors                         GENERATED  (imports / imported-by, ref-weighted)
## Tests                             GENERATED  (emitted even when empty)
## Budget                            GENERATED  (lines vs 500)
## Env                               GENERATED  (omitted when empty)
<free-form H2 tail>                  AUTHORED, optional, uncapped
```

Do not hand-edit content between the `BEGIN/END GENERATED` markers — `npm run docs:generate` maintains it. The tail is the one authored slot, and it is the one no parser could produce. The H1 is the other: it names the source file and gives it a short label, which the structure tree above reads.

**H2-only.** Every addressable field is `## <Exact Name>`, and runs from that heading to the next H2 or to the next generated marker. No inline-bold fields, no frontmatter: a second grammar buys nothing the queries need.

The canonical names above are **reserved** — a page spells one exactly and puts it in that order. The tail is **positional, not name-based**: anything after the canonical head is detail, addressable as a block and enumerable by heading. That is what lets it stay unconstrained and still be machine-readable.

**Size caps.** `Role` ≤ 400 characters, `Read When` ≤ 3 bullets, tail uncapped. Role and Read When are the sections pulled in bulk across a glob, so their cost scales with page count and the cap has to be hard. A tail section is only ever fetched one page at a time.

| Generated section | Derived from |
| --- | --- |
| `Role` | `@role` in the source file's module header (`scripts/docgen/map-intent.ts`) |
| `Read When` | `@readwhen` in the same header; every module carries one |
| `Exports` | each export's signature and its JSDoc (`scripts/docgen/map-exports.ts`) |
| `Neighbors` | the intra-`src/` import graph, both directions (`scripts/docgen/map-facts.ts`) |
| `Tests` | the mirrored `tests/` file, plus a count of the others that name this module |
| `Budget` | lines against the 500-line limit, counted exactly as the gate counts them |
| `Env` | `process.env` reads in the source; absent when the module reads none |

**Neighbors are ranked, not listed.** `×7` weighs the edge: how many times the importing file mentions the names it imported, or for a re-export, how many names it carries across. The file a module leans on sorts above the one it touches once — salience is derived rather than curated, which is why no page carries a hand-written "why it matters" line beside an edge. Long lists are cut off with `+n more`; the withheld edges are the lightest ones.

**Intent lives in the source file, not on the page** — for the same reason in both directions: a sentence sitting beside the code it describes is edited in the diff that invalidates it, which is where map drift comes from.

- What the module is for, and when to open it, go in the **module header**: `@role <one paragraph>` and `@readwhen`, whose body is copied to the page verbatim (a bullet list on most pages, a sentence on some). `docs/map/` mirrors `src/` at identical depth, so a relative link written in a header resolves the same from the page.
- Per-export intent goes in that export's **JSDoc**, which `Exports` lifts.

The header holds **tags and nothing else**. Untagged prose there attaches to the first export when that export has no comment of its own, and would then print inside the page's own `Exports` block. The header is exempt from the 500-line limit (`docs/line-limit.md`), so there is no reason to keep it short at the expense of saying what the file is.

```ts
/**
 * @role Executes one model turn: routes to a provider, builds the system prompt,
 * streams text, optionally enables tools, and returns response metadata.
 *
 * @readwhen
 * - Changing model turn execution, tool enablement, or stream error handling.
 */
```

`npm run docs:generate` checks generated reference docs first. If they are current, it leaves them untouched; if they are stale, it regenerates them (including every page's generated blocks and this file's structure tree). It then runs `scripts/checks/check-map.ts`, which pairs every `src/**/*.ts` file with its page and enforces everything above: the page exists and is linked from here, the H1 names its source file, every required section is present and exactly spelled as an H2, the canonical head runs in order above the tail, no prose sits outside a section, and `Role` and `Read When` are inside their caps. Caps and intent are checked against the **source tags**, so a failure names the tag to edit rather than a page you cannot hand-fix.

No check can see whether a tag still *describes* its code. That question is a sweep: `npm run intent-drift` asks it of every source file, and `npm run map-drift` asks it of every authored tail. See [sweeps.md](../sweeps.md).

`docs:generate` also reports which *non-map* docs your source changes oblige you to check — see [docs.md](../docs.md#codebase-map).

In the tail, write whatever sections the file's behavior needs. Keep it short and operational, and do not restate a fact a generated section already carries.

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

Section names resolve through the manifest in `scripts/docgen/map-sections.ts` — the single definition of map structure, read by every generator, check and query. It still carries the older spellings as aliases (`Key Neighbors` and `Key neighbours` answer to `Neighbors`; an inline `**Read when:**` answers the same as `## Read When`) even though no page uses them any more, so a query still resolves one that gets reintroduced.

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
  - [`system-prompt.ts`](agent/system-prompt.md) (77) — System Prompt
  - [`tool-render-gate.ts`](agent/tool-render-gate.md) (80) — Tool Render Gate
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
  - [`turn-messages.ts`](agent/turn-messages.md) (195) — Turn Message Shape Rules
  - [`usage-finalize.ts`](agent/usage-finalize.md) (45) — Turn Usage/Quota Finalization
  - [`workspace.ts`](agent/workspace.md) (72) — Agent Tool Context
- `src/cli/chrome/`
  - [`ansi.ts`](cli/chrome/ansi.md) (56) — Terminal Geometry & Escape Sequences
  - [`bottom-ui.ts`](cli/chrome/bottom-ui.md) (485) — Bottom Terminal UI
  - [`footer-status.ts`](cli/chrome/footer-status.md) (225) — Footer Status State and Formatters
  - [`input-buffer.ts`](cli/chrome/input-buffer.md) (117) — Input Buffer State
  - [`suggestion-overlay.ts`](cli/chrome/suggestion-overlay.md) (58) — Suggestion Overlay Snapshot
  - [`toggles.ts`](cli/chrome/toggles.md) (121) — Footer Toggle State
  - [`turn-state.ts`](cli/chrome/turn-state.md) (82) — Agent-Turn UI State
- `src/cli/`
  - [`command-dispatcher.ts`](cli/command-dispatcher.md) (260) — Command Dispatcher
- `src/cli/eval/`
  - [`custom-eval-menu.ts`](cli/eval/custom-eval-menu.md) (360) — Custom Eval Tab + Run Loop
  - [`eval-dots.ts`](cli/eval/eval-dots.md) (30) — Eval Status Circle Renderers
  - [`eval-menu.ts`](cli/eval/eval-menu.md) (122) — Unified Eval Menu
  - [`eval-screen.ts`](cli/eval/eval-screen.md) (177) — Eval Screen Renderers
  - [`humaneval-menu.ts`](cli/eval/humaneval-menu.md) (319) — HumanEval Tab + Run Loop
- `src/cli/`
  - [`headless-prompt.ts`](cli/headless-prompt.md) (152) — Headless Prompt Mode (`-p`)
- `src/cli/menus/`
  - [`action-menu.ts`](cli/menus/action-menu.md) (52) — Inline Action Sub-menu
  - [`list-menu.ts`](cli/menus/list-menu.md) (364) — Shared Tabbed List Menu
  - [`menu-shell.ts`](cli/menus/menu-shell.md) (46) — Menu Lifecycle Chrome
  - [`model-screen.ts`](cli/menus/model-screen.md) (252) — Model Picker Screen Renderers
  - [`raw-picker.ts`](cli/menus/raw-picker.md) (240) — Shared Raw-Mode Picker
- `src/cli/render/`
  - [`banner.ts`](cli/render/banner.md) (135) — Startup Banner
  - [`markdown-renderer.ts`](cli/render/markdown-renderer.md) (489) — Markdown Renderer
  - [`transcript-format.ts`](cli/render/transcript-format.md) (215) — Transcript Formatters
  - [`transcript-options.ts`](cli/render/transcript-options.md) (76) — Transcript Stream + Options
  - [`transcript-record.ts`](cli/render/transcript-record.md) (150) — Rendered Transcript Record
  - [`transcript-renderer.ts`](cli/render/transcript-renderer.md) (403) — Agent Transcript Formatting
  - [`transcript-replay.ts`](cli/render/transcript-replay.md) (78) — Post-Wipe Transcript Replay
- `src/cli/`
  - [`scripted-mode.ts`](cli/scripted-mode.md) (95) — Scripted Session Mode
  - [`session-modes.ts`](cli/session-modes.md) (446) — Session Modes
  - [`session-runner.ts`](cli/session-runner.md) (76) — CLI Session Loop
  - [`slash-commands.ts`](cli/slash-commands.md) (75) — Slash Commands
  - [`stdout-retry-sink.ts`](cli/stdout-retry-sink.md) (33) — Non-TTY Retry Countdown Sink
  - [`theme.ts`](cli/theme.md) (67) — Color Tokens
- `src/cli/tools/`
  - [`tool-approval.ts`](cli/tools/tool-approval.md) (344) — Tool Approval Prompts
  - [`tool-invocation.ts`](cli/tools/tool-invocation.md) (357) — Hand-Typed Tool Call Parsing
  - [`tool-runner.ts`](cli/tools/tool-runner.md) (103) — Hand-Typed Tool Execution + /tools Listing
- `src/commands/`
  - [`config.ts`](commands/config.md) (401) — Interactive Config Editor
  - [`model.ts`](commands/model.md) (389) — Interactive Model Picker
  - [`renderer.ts`](commands/renderer.md) (283) — Renderer Demo Command
  - [`status.ts`](commands/status.md) (51) — /status Command
- `src/config/`
  - [`index.ts`](config/index.md) (253) — Configuration Loader
- `src/eval/`
  - [`custom.ts`](eval/custom.md) (100) — Custom Eval Discovery and Hashing
  - [`errors.ts`](eval/errors.md) (76) — Eval API Error Parser
  - [`history.ts`](eval/history.md) (116) — Eval History and Status Computation
  - [`humaneval-data.ts`](eval/humaneval-data.md) (105) — HumanEval Dataset Loader
  - [`result-sink.ts`](eval/result-sink.md) (78) — Eval Result JSON IPC Sink
  - [`runner.ts`](eval/runner.md) (207) — Eval Subprocess Runner
- [`index.ts`](index.md) (226) — CLI Entry Point
- [`logger.ts`](logger.md) (53) — Logging Utility
- `src/providers/adapters/`
  - [`adapter-http-retry.ts`](providers/adapters/adapter-http-retry.md) (188) — Adapter HTTP Retry/Backoff
  - [`adapter-usage-capture.ts`](providers/adapters/adapter-usage-capture.md) (51) — Shared Usage/Header Capture
  - [`openai-compat-quirks.ts`](providers/adapters/openai-compat-quirks.md) (64) — OpenAI-Compatible Provider Quirk Profiles
  - [`openai-compat-request.ts`](providers/adapters/openai-compat-request.md) (69) — OpenAI-Compatible Request Transforms
  - [`openai-compat-sse.ts`](providers/adapters/openai-compat-sse.md) (141) — OpenAI-Compatible SSE Transforms
  - [`openai-compat.ts`](providers/adapters/openai-compat.md) (247) — OpenAI-Compatible Adapter
- `src/providers/`
  - [`fake.ts`](providers/fake.md) (436) — Fake LLM Fixtures
  - [`index.ts`](providers/index.md) (3) — Provider Re-exports
  - [`model-data.ts`](providers/model-data.md) (281) — Unified Model Store
  - [`model-quirks.ts`](providers/model-quirks.md) (31) — Per-Model Static Quirks
  - [`model-settings-accessor.ts`](providers/model-settings-accessor.md) (13) — Model Settings Accessor
  - [`openai-daily-spend.ts`](providers/openai-daily-spend.md) (185) — OpenAI Daily Spend Footer
  - [`paid-guard.ts`](providers/paid-guard.md) (59) — Free-Only Hard Block
  - [`pricing-verifier.ts`](providers/pricing-verifier.md) (122) — Dual-Source Pricing Verifier
  - [`provider-catalog.ts`](providers/provider-catalog.md) (330) — Provider Catalog
  - [`provider-registry.ts`](providers/provider-registry.md) (455) — Provider Registry
- `src/providers/quota/`
  - [`cache.ts`](providers/quota/cache.md) (38) — Quota Cache
  - [`headers.ts`](providers/quota/headers.md) (253) — Provider Rate-Limit Header Parsing
- `src/providers/`
  - [`types.ts`](providers/types.md) (63) — Type Definitions
  - [`user-blocklist.ts`](providers/user-blocklist.md) (81) — Per-User Model Blocklist
- `src/store/`
  - [`call-log.ts`](store/call-log.md) (51) — Per-Call LLM Log
  - [`db-config-cache.ts`](store/db-config-cache.md) (54) — DB Config Cache
  - [`db-load.ts`](store/db-load.md) (92) — DB Row Hydration
  - [`db-replica.ts`](store/db-replica.md) (27) — Replica Detection & Recovery
  - [`db-schema.ts`](store/db-schema.md) (86) — Table & Index DDL
  - [`db-types.ts`](store/db-types.md) (5) — Shared Store Types
  - [`db.ts`](store/db.md) (476) — SQLite Store (libSQL/Turso)
  - [`model-list-cache.ts`](store/model-list-cache.md) (106) — Model List Cache
  - [`store-paths.ts`](store/store-paths.md) (57) — Store Location & Sync Credentials
- `src/tokenizers/backends/`
  - [`bpe-json.ts`](tokenizers/backends/bpe-json.md) (41) — HF Fast-Tokenizer (tokenizer.json) Backend
  - [`tekken.ts`](tokenizers/backends/tekken.md) (52) — Mistral Tekken (tekken.json) Backend
  - [`tiktoken.ts`](tokenizers/backends/tiktoken.md) (48) — Tiktoken-Backed Exact Encoders
- `src/tokenizers/`
  - [`chat-format.ts`](tokenizers/chat-format.md) (47) — Shared Chat-Overhead Formula
  - [`count.ts`](tokenizers/count.md) (129) — Tokenizer Engine Public Surface
  - [`download-tokenizer.ts`](tokenizers/download-tokenizer.md) (112) — HF Tokenizer File Cache/Download
  - [`fallback-estimate.ts`](tokenizers/fallback-estimate.md) (33) — Generic Tiktoken Fallback Estimator
  - [`model-family.ts`](tokenizers/model-family.md) (146) — Tokenizer Family Resolver
- `src/util/`
  - [`errors.ts`](util/errors.md) (327) — Shared Error Utilities
  - [`guards.ts`](util/guards.md) (3) — Type Guard Utilities
  - [`keyboard.ts`](util/keyboard.md) (4) — Raw-Key Helpers
  - [`line-diff.ts`](util/line-diff.md) (38) — LCS Line Diff
  - [`line-numbers.ts`](util/line-numbers.md) (13) — Line-Number Gutter
  - [`screen-buffer.ts`](util/screen-buffer.md) (210) — Screen Buffer
  - [`text-encoding.ts`](util/text-encoding.md) (27) — Text Encoding Helpers
  - [`wrap-rows.ts`](util/wrap-rows.md) (53) — Wrapped-Row Math
<!-- END GENERATED MAP STRUCTURE -->

## Main Flow

Runtime starts in [index.md](index.md), enters [cli/session-runner.md](cli/session-runner.md), dispatches slash commands through [cli/command-dispatcher.md](cli/command-dispatcher.md), and sends normal turns to [agent/loop.md](agent/loop.md).

Provider selection lives in [providers/provider-registry.md](providers/provider-registry.md). Tool wrappers live under [agent/tools/](agent/tools/index.md).
