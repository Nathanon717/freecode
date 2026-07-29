# E2E Test Authoring

E2e tests live in `tests/e2e/*.e2e.json` and run through `tests/harness/run-e2e.ts`. There are two execution modes:

- **Script mode** (default): the harness runs `node dist/index.js --script <temp-file>`, covering the real scripted interactive path. stdin is a pipe, so the bottom-pinned terminal UI does not activate.
- **TTY screen mode** (`tty` block present): the harness spawns the built CLI through a pseudo-terminal, renders its output with a headless VT emulator, and asserts against the rendered screen. This exercises the full interactive TUI — raw-mode input, autocomplete, scroll regions, the pinned status line — which script mode cannot reach. See [TTY screen e2e tests](#tty-screen-e2e-tests).

## Commands

```powershell
npm test              # build + docs check + all e2e tests including TTY + unit tests (no PTY)
npm run pty:test      # PTY driver + session manager vitest unit tests (require a PTY)
```

`npm test` runs its sections in order and stops at the first failure, naming the section that
failed and listing the sections that therefore did not run (`FAILED: e2e (exit 1) - stopping.`
/ `Not run: unit tests.`). A section that dies without printing its own summary — a native
crash mid-run — would otherwise leave the pipeline looking like it simply skipped the rest.
The message is deliberately ASCII: it has to stay readable under a classic cmd.exe codepage.

`npm test` is the normal post-change safety check. E2e tests never call a live LLM — fake LLM fixtures cover the agent loop deterministically, and every other e2e test runs with the loop hard-blocked (`FREECODE_NO_LLM=1`) and provider keys stripped from its environment.

## PTY unit tests

Two vitest test files exercise the PTY harness itself rather than freecode's UI:

- **`tests/harness/pty/driver.test.ts`** — unit tests for `createPtyDriver` using a minimal `node -e` subprocess. Covers: raw output capture, snapshot, transcript (scrollback), `waitForText` returning false on timeout, exit detection, `exitCode`, `kill`, and keystroke delivery. Does not require a freecode build.
- **`tests/harness/pty/session.test.ts`** — integration tests for the persistent TCP session manager (`session.ts`). Exercises the full RPC round-trip: `start` → `screen` → `send` → `stop`. Skips automatically when `dist/index.js` is absent; run `npm run build` first.

Both files self-skip unless `FREECODE_PTY=1` is set. `npm run pty:test` sets it; nothing else does, so a bare `vitest` (watch mode) reports them as skipped instead of running a real PTY against the whole unit suite in parallel — the daemon's 20s readiness budget is not reliably met under that contention. The pipeline additionally `--exclude`s both files so `npm test` never even imports node-pty's native binding.

Run them with:

```powershell
npm run pty:test
```

Or as part of the full test suite (excluding PTY tests):

```powershell
npm test
```

**Windows / ConPTY gotcha**: `node -e "..."` subprocesses spawned through ConPTY crash at startup (CSPRNG init) unless the parent's full `process.env` is forwarded. Always pass `env: { ...process.env }` when creating a driver with an arbitrary node subprocess as the command.

Inside the CLI, run `/eval` to list evals, see the checks each one performs, and select one or many evals to run sequentially. `/eval` accepts numbers, names, comma/space-separated selections, and numeric ranges such as `1-3`.

For the generated e2e test inventory, see [e2e.md](e2e.md).

## Basic Shape

Any e2e test that drives the agent loop pairs a `mock:*` model with an `llmFixture` (fake fixture — see [Fake LLM Fixtures](#fake-llm-fixtures) below); e2e tests never reach a live provider.

```json
{
  "name": "02-eval-medium-create-files",
  "description": "Medium: create a small nested project with exact code and JSON files",
  "model": "mock:gpt-freecode-test",
  "llmFixture": "02-eval-medium-create-files.llm.json",
  "config": {
    "toolRationale": false,
    "useOllama": false
  },
  "workspace": "temp",
  "turns": [
    {
      "input": "Use list_dir with path \".\" first. Then use create to create src/math.js with content exactly \"export function sum(values) {\\n  return values.reduce((total, value) => total + value, 0);\\n}\\n\". Then use create to create config/app.json with content exactly \"{\\n  \\\"name\\\": \\\"eval-medium\\\",\\n  \\\"enabled\\\": true,\\n  \\\"limits\\\": {\\n    \\\"items\\\": 3\\n  }\\n}\\n\". Do not use any other tools."
    },
    { "input": "y" },
    { "input": "y" },
    { "input": "y" }
  ],
  "expect": {
    "stdoutAbsent": ["Error:"],
    "exitCode": 0,
    "files": [
      {
        "path": "src/math.js",
        "contentExact": "export function sum(values) {\n  return values.reduce((total, value) => total + value, 0);\n}\n"
      },
      {
        "path": "config/app.json",
        "contentExact": "{\n  \"name\": \"eval-medium\",\n  \"enabled\": true,\n  \"limits\": {\n    \"items\": 3\n  }\n}\n"
      }
    ],
    "toolTrace": {
      "maxCalls": 3,
      "sequence": ["list_dir", "create", "create"],
      "absent": ["read_file", "grep", "shell_exec"]
    }
  }
}
```

## Fields

- `name`: Stable kebab-case identifier shown in harness output.
- `description`: Human-readable purpose of the e2e test.
- `config`: Optional temporary `config.json` contents written under the e2e test's isolated `FREECODE_HOME`.
- `workspace`: Use `"temp"` for file-writing or project-mutating e2e tests. Omit it or use `"repo"` for structural CLI checks.
- `flags`: Optional CLI flags inserted before `--script`.
- `model`: Optional model preference passed as `--model <value>`.
- `llmFixture`: Fake LLM script path, relative to `tests/e2e/`. Required for any e2e test that drives the agent loop; pair it with a `mock:*` model. Without a fixture, the loop is hard-blocked (`FREECODE_NO_LLM=1`).
- `turns`: Input lines sent to script mode. Script mode exits cleanly after the final turn.
- `y`/`yes` and `n`/`no` turns are consumed as tool-call confirmations when the agent requests a tool. If the next turn is not an approval answer, the tool call is denied and the turn remains available as normal user input.
- Approval turns are skipped if there is no pending tool request, so a failed provider call does not accidentally turn `y` into a user prompt.

## Assertions

- `stdoutContains`: Substrings expected in combined stdout + stderr.
- `stdoutAbsent`: Substrings that must not appear in combined stdout + stderr.
- `stdoutOrder`: Substrings that must appear in this left-to-right order in combined stdout + stderr.
- `stdoutBlock`: Consecutive stdout lines that must appear verbatim — the non-TTY twin of `screenBlock`, same matcher and tokens. See [Block assertions](#block-assertions).
- `exitCode`: Expected process exit code.
- `files`: File assertions relative to the e2e test workspace.
- `files[].contentExact`: Exact file content. On mismatch, the harness prints the actual content.
- `toolTrace.maxCalls`: Maximum allowed tool calls.
- `toolTrace.sequence`: Exact tool call sequence.
- `toolTrace.present`: Tool names that must appear at least once.
- `toolTrace.absent`: Tool names that must not appear.
- `fakeLlmTrace.callCount`: Exact number of fake model calls.
- `fakeLlmTrace.maxCalls`: Maximum allowed fake model calls.
- `fakeLlmTrace.calls[]`: Per-call assertions for provider, model, execution path, input message count, last user text, available/absent tools, tool settings, emitted text, emitted tool calls, and usage.

## Fake LLM Fixtures

Fake LLM fixtures let an e2e test enter the real agent loop without provider keys, network access, or paid usage. The harness sets `FREECODE_FAKE_LLM=1`, strips real provider API keys, passes the fixture through `FREECODE_FAKE_LLM_SCRIPT`, and does not set `FREECODE_NO_LLM=1` for that process. TTY e2e tests may also set `llmFixture`; the interactive process receives the same fake-model environment so flows such as `/eval` can run in CI without live providers.

Use this mode for free verification of prompt construction, model routing, deterministic assistant text, and tool-call orchestration. The current fake runner supports ordered text/chunk responses, scripted `toolCalls`, usage metadata, strict unused-step checks, execution-setting matchers, and fake model traces. Prompt-tool fallback scripting and OpenAI Responses-style fake transports are still separate future work.

```json
{
  "name": "agent-text-fake",
  "description": "Agent loop returns deterministic text through a fake model",
  "workspace": "temp",
  "model": "mock:gpt-freecode-test",
  "llmFixture": "agent-text-fake.llm.json",
  "turns": [
    { "input": "Say PONG" }
  ],
  "expect": {
    "stdoutContains": ["PONG"],
    "stdoutAbsent": ["Error:"],
    "exitCode": 0,
    "fakeLlmTrace": {
      "callCount": 1,
      "calls": [
        {
          "provider": "mock",
          "model": "gpt-freecode-test",
          "inputMessageCount": 1,
          "lastUserContains": ["Say PONG"],
          "toolsAvailable": ["read_file", "create"],
          "toolRationale": true,
          "parallelTools": true,
          "nativeToolsSupplied": true,
          "emittedTextContains": ["PONG"],
          "usage": { "promptTokens": 10, "outputTokens": 1, "totalTokens": 11 }
        }
      ]
    }
  }
}
```

Fixture files are JSON and live next to e2e tests:

```json
{
  "version": 1,
  "model": "mock:gpt-freecode-test",
  "steps": [
    {
      "match": {
        "turn": 1,
        "messageCount": 1,
        "mustContain": ["Say PONG"],
        "toolsAvailable": ["read_file", "create"],
        "systemPromptPresent": true,
        "toolRationale": true,
        "parallelTools": true,
        "nativeToolsSupplied": true
      },
      "response": {
        "chunks": ["PONG"],
        "usage": { "promptTokens": 10, "outputTokens": 1, "totalTokens": 11 }
      }
    }
  ]
}
```

Tool-driving fixtures use the same ordered steps. A step may emit `toolCalls`; the agent loop executes those calls through the normal `createTools()` wrappers, then injects `<tool_result>` content as the next user message for the following fake step:

```json
{
  "version": 1,
  "model": "mock:gpt-freecode-test",
  "steps": [
    {
      "match": {
        "turn": 1,
        "messageCount": 1,
        "mustContain": ["Create note.txt"],
        "toolsAvailable": ["create"],
        "nativeToolsSupplied": true
      },
      "response": {
        "chunks": ["I'll create it."],
        "toolCalls": [
          { "name": "create", "args": { "path": "note.txt", "content": "ok\n" } }
        ],
        "usage": { "promptTokens": 20, "outputTokens": 5, "totalTokens": 25 }
      }
    },
    {
      "match": {
        "turn": 2,
        "messageCount": 3,
        "mustContain": ["<tool_result name=\"create\">"]
      },
      "response": {
        "text": "Created note.txt.",
        "usage": { "promptTokens": 30, "outputTokens": 4, "totalTokens": 34 }
      }
    }
  ]
}
```

Fake mode is intentionally strict:

- E2e tests with `llmFixture` must use a `mock:*` model.
- `mock:*` models are rejected unless `FREECODE_FAKE_LLM=1`.
- Real providers are rejected while `FREECODE_FAKE_LLM=1`.
- Live model discovery is rejected while `FREECODE_FAKE_LLM=1`.
- Fixture steps are consumed in order; an unexpected prompt, model, missing tool, or exhausted fixture produces an explicit error.
- Unless `allowUnusedSteps` is true, all fixture steps must be consumed by the time the fake model returns a final no-tool response.
- `fakeLlmTrace` assertions read the trace written by `FREECODE_FAKE_LLM_TRACE`, so fake e2e tests can verify model call count, routing, execution path, input message count, prompt-facing text, available tools, tool settings, emitted text, emitted tool calls, and usage metadata.

## TTY screen e2e tests

An e2e test with a top-level `tty` block is driven through a real pseudo-terminal instead of script mode, and its assertions run against the *rendered screen* (what a human would see), not raw stdout. Use this for interactive UI behavior: autocomplete, suggestion lists, the pinned input/status line, menus, and screen redraws. Nothing is reconstructed — the escape sequences the CLI emits are applied by a VT emulator (`@xterm/headless`) over a PTY (`node-pty`).

Omit `turns`/`expect`; the `tty` block fully describes the run.

```json
{
  "name": "tty-autocomplete",
  "description": "Interactive TUI: slash command suggestions and tab completion",
  "tty": {
    "cols": 80,
    "rows": 24,
    "readyText": "for commands",
    "steps": [
      { "name": "idle prompt", "screenContains": [".d888", "> / for commands"] },
      { "name": "type /", "send": "/", "screenContains": ["/clear", "/config", "> /"] },
      { "name": "filter", "send": "cle", "screenContains": ["> /cle"], "screenAbsent": ["/config"] },
      { "name": "tab", "send": "\t", "screenContains": ["> /clear"] }
    ],
    "exit": "\u0003",
    "expectExit": true,
    "exitCode": 0
  }
}
```

### `tty` fields

- `cols` / `rows`: Terminal size. Default `80` x `24`. Keep fixed for determinism.
- `readyText`: Substring awaited in the raw stream before the first step, signaling the prompt is live. Default `"for commands"`.
- `steps[]`: Ordered interactions, each evaluated after the screen settles.
  - `name`: Label used in failure messages.
  - `send`: Keystrokes to send. Control chars use JSON escapes: `"\t"` (Tab), `"\r"` (Enter), `"\u0003"` (Ctrl-C). The interactive input handler only acts on control keys when they arrive as a standalone chunk — always send typed text and a control key as **separate steps** (e.g. `{"send": "/model"}` then `{"send": "\r"}`). Bundling them (e.g. `"/model\r"`) silently drops the control character.
  - `resize`: `{ "cols": N, "rows": N }` — resize the PTY (and emulator viewport) before asserting, delivering a real SIGWINCH exactly as dragging a terminal edge would. Applied **after** `send`, so a step can type then resize. How long the child takes to *hear* about a resize belongs to the terminal, not to us: the ConPTY host is pinned to 1.23 (~15 ms) by `postinstall`, because the 1.25 node-pty bundles takes ~1–1.5 s and under load sometimes never delivers (`docs/bug log/29-07-2026f.md`). A resize step is paced by its `screenContains`, which is waited for rather than sampled — so don't reach for `quietMs`, and if one of these goes flaky check the pin marker before anything else. Used by the `tty-resize-*` e2e tests to pin the resize behavior (banner responsiveness, transcript reflow-in-place, input/overlay/menu survival). The stale duplicate-footer block after a transcript-path resize *is* expressible with `screenCounts` (assert the prompt appears exactly once); `tty-resize-preserves-transcript` guards it that way. The stray-`>` accumulation in scrollback is still not viewport-expressible and remains under manual/PTY coverage (see `docs/bug log/14-07-2026.md` and `docs/bug log/22-07-2026.md`).
  - `waitFor`: Optional substring to await in the raw stream before asserting.
  - `waitForMs`: Override the `waitFor` budget (default `8000`). Raise it for heavy steps (e.g. running a real subprocess) that can stall under the CPU contention of many TTY e2e tests running in parallel.
  - `screenContains` / `screenAbsent`: Substrings that must / must not appear on the rendered viewport.
  - `screenCounts`: `{ "<substring>": N }` — each substring must appear exactly `N` times on the viewport. Catches stale duplicates that presence/absence can't, e.g. a resize leaving a second ghost copy of the input frame (`"> / for commands"` should count `1`, not `2`).
  - `screenBlock` / `transcriptBlock`: consecutive rows that must appear verbatim — see [Block assertions](#block-assertions).
  - `screenStyles`: colour and attribute assertions on the cells behind on-screen text — see [Colour assertions](#colour-assertions).
  - `quietMs`: Override the per-step settle window (default `350`).
- `exit`: Keystrokes sent after the last step to end the process. Default `"\u0003"` (Ctrl-C); the CLI has no `/exit` command.
- `expectExit`: Require the process to exit after `exit`.
- `exitCode`: Expected exit code when it exits.
- `mask`: Optional regex strings stripped from the screen before substring checks, for volatile content (e.g. token counts).

### Block assertions

`screenContains` cannot express layout. A blank line in the wrong place, a
missing divider, a preview that lost its indent — all pass. `screenBlock`
(viewport) and `transcriptBlock` (scrollback + viewport) assert **consecutive
rows verbatim**, so blank lines are significant and the transcript's documented
turn layout becomes enforceable:

```json
{
  "name": "the turn renders with its documented spacing",
  "transcriptBlock": [
    "Reading both helpers.",
    "",
    "Checking the type guard first",
    "read(src/util/guards.ts)",
    "re:^  1: export function isRecord",
    "*",
    "  3: }",
    "",
    "read(src/util/keyboard.ts)",
    "...",
    "re:^─+$",
    "",
    "xyzzy-parallel-done"
  ]
}
```

Each line is one of:

- a **literal** — must match the row exactly. Trailing whitespace is ignored on
  both sides; **leading whitespace is significant**, since indentation is
  precisely what these assertions exist to pin.
- `"*"` — matches any one row. Use for rows whose content is volatile (a preview
  line that soft-wraps at the terminal edge).
- `"..."` — matches any number of rows, including none. Use to bridge chrome you
  do not want to pin.
- `"re:<pattern>"` — a regex. Use for width-dependent rows: the step divider is
  as wide as the terminal, so `"re:^─+$"`.

Use `transcriptBlock` for anything longer than a few rows: `screenBlock` sees
only the viewport, and a full multi-step turn with result previews is taller
than it.

**Authoring:** run the e2e test with `TTY_DUMP=1` and copy the rows out of the
dump rather than guessing them.

```bash
TTY_DUMP=1 npx tsx tests/harness/run-e2e.ts --no-build --only=tty-parallel-tools
```

Each step prints its rendered rows, numbered and quoted, blank rows included.
On failure the matcher prints the wanted block against the rows it found and
marks the ones that differ, so a break says *how* the layout changed.

#### `stdoutBlock` (non-TTY scenarios)

Script-mode scenarios get the same matcher over the child's stdout lines, with
ANSI stripped. It lives in the top-level `expect` block, not in a `tty` step:

```json
{
  "env": { "FREECODE_TRANSCRIPT_STREAM": "stdout" },
  "expect": {
    "stdoutBlock": [
      "Let's make this change.",
      "",
      "Writing the grading script as requested",
      "create(grade.py)",
      "  1: print('grade: A')",
      "...",
      "",
      "re:^─+$",
      "",
      "The script now runs successfully and prints the grade summary."
    ]
  }
}
```

Two things differ from the TTY blocks:

- **`env.FREECODE_TRANSCRIPT_STREAM: "stdout"` is mandatory.** Transcript output
  (tool call lines, result previews, dividers) goes to stderr by default, and the
  harness captures the two streams separately and concatenates them — their true
  interleaving is already gone. A block spanning both would be asserting an order
  that never existed. The assertion fails with that explanation rather than
  reporting a layout mismatch the author cannot act on.
- **No colour assertions.** There is no emulator here, only bytes; `screenStyles`
  has no non-TTY counterpart.

Author it from `E2E_DUMP=1`, the non-TTY counterpart of `TTY_DUMP`:

```bash
E2E_DUMP=1 npx tsx tests/harness/run-e2e.ts --no-build --only=agent-preamble-flush
```

### Colour assertions

`screenStyles` asserts the colour and attributes of the cells behind on-screen
text — the one thing substring matching can never reach. The emulator has
carried these attributes all along; the driver exposes them via `cells()`.

```json
{
  "screenStyles": [
    { "text": "-LINE-001: changelog entry", "fg": "red" },
    { "text": "+LINE-XYZ-REPLACED: changelog entry", "fg": "green" },
    { "text": "  3: }", "dim": true },
    { "text": "read(src/util/guards.ts)", "fg": "rgb" }
  ]
}
```

`fg` accepts a chalk colour name (`red`, `green`, `magentaBright`, …), an
explicit `#rrggbb`, or one of the mode-only matchers:

| `fg` | matches |
| --- | --- |
| `"default"` | unstyled — the terminal's default foreground |
| `"any"` | anything but default |
| `"palette"` | a 16/256-colour palette entry (what chalk's named colours emit) |
| `"rgb"` | a truecolor value, without pinning which |

`bold`, `dim` and `italic` are booleans. Only **non-blank** cells are checked: a
space carries whatever attributes were active when it was written, which is real
but not worth pinning a test to.

Use the mode-only forms for anything drawn in the **banner colour** — tool call
lines, rationales, the `> ` prompt echo. That colour is `chalk.rgb()` from a
palette that advances per launch, so `"rgb"` pins that the element is still
coloured without welding the test to one pastel. Semantically fixed colours
(a diff's red/green, a dim preview) should be pinned by name.

Colour assertions are TTY-only. In script mode stdout is a pipe, so chalk emits
no styling at all and there is nothing to assert.

Use `npm run pty` to drive the live CLI interactively and print the rendered screen after each step — the fastest way to visually verify a UI change without writing a full e2e file:

```bash
ID=$(npm run pty -- start 2>&1 | grep SESSION_ID | cut -d= -f2)
printf '/model' | npm run pty -- send "$ID" -   # type command
printf '\r'     | npm run pty -- send "$ID" -   # submit
npm run pty -- stop "$ID"
```

See `docs/pty-session.md` for the full reference, control character table, and common patterns.

Run `npx tsx tests/harness/pty/demo.ts` for a fixed startup-through-`/clear` walkthrough. The harness driver lives in `tests/harness/pty/driver.ts` and the e2e test runner in `tests/harness/pty/run-tty-e2e.ts`.

### Per-step timing

Per-phase timing for a single TTY e2e test is part of the unified timing tool — drill in with:

```
npm run time -- e2e tty-autocomplete
```

That sets `TTY_TIMING=1` internally and narrows the run to the one e2e test, so the harness records one timing per phase (startup → each step → exit) and `time.ts` nests them as children of the e2e test in the timing report — no separate raw output. See [time.md](scripts/time.md) for the full timing model (depth follows scope). `TTY_TIMING` itself is an internal mechanism, not a knob you type.

The phases appear as a chronological timeline under the e2e test, and the leftover wall clock (Node spawn, harness boot, teardown) is reconciled into a sibling `harness startup + teardown` line so the children sum to the section total:

```
✓ e2e                                                     21.01s
  ✓ tty-humaneval-fake                                   15.13s
    ✓ startup                                            4.05s
    ✓ run HumanEval/0                                    8.76s
    ✓ exit                                               0.05s
    …
  ✓ harness startup + teardown                           5.88s
```

What the phases cover:
- `startup` — spawn → `readyText` appears in the raw stream, plus the mandatory 400 ms post-ready silence-settle (~2–3 s per e2e test, dominated by Node.js startup and DB init).
- each step (labeled by the step's `name`) — the `send` plus its wait/settle. A step with `screenContains` polls the rendered viewport until every needle is present (4 s budget, 10 s on a `resize` step, where the wait is on the terminal delivering the size change to the child), then settles 100 ms; a step that never reaches its expected state spends the whole budget and then settles `quietMs` before failing. The viewport is polled, not the raw stream, because `raw` is cumulative — a needle an earlier step printed would match instantly.
- `exit` — the exit keystroke through process teardown.

A phase is marked failed (`✗`) if any assertion in that phase failed.

**Where time typically goes in slow e2e tests:**

| Cost | Cause |
|---|---|
| ~2–3 s fixed per e2e test | Node.js spawn + app boot + 400 ms post-ready settle |
| up to 4 s + settle on a step whose `screenContains` never appears | the viewport poll spending its full budget before failing |
| settle overrun (e.g. cfg=500 ms → actual=1 073 ms) | UI keeps emitting after `send`; silence timer resets |
| 7–10 s for humaneval / eval steps | Python subprocess or fake-LLM agent turn; use `waitFor` + `waitForMs` |

## Guidelines

- Prefer `workspace: "temp"` for agent tasks that create or edit files.
- Fixture output is deterministic, so exact text, file, and tool-trace assertions are all reliable — assert on whatever most precisely pins the behavior under test.
- Use exact file assertions for deterministic artifacts.
- Use tool trace assertions to catch inefficient behavior, but avoid overfitting unless the workflow truly requires a specific sequence.
- Include only the tool approval turns you expect the e2e test to need. Extra unexpected tool calls will be denied unless followed by another `y`/`yes`.
- Keep each e2e test focused on one user-visible behavior.
