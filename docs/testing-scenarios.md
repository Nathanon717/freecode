# Scenario Authoring

Scenario tests live in `tests/scenarios/*.scenario.json` and run through `tests/harness/run-scenarios.ts`. There are two execution modes:

- **Script mode** (default): the harness runs `node dist/index.js --script <temp-file>`, covering the real scripted interactive path. stdin is a pipe, so the bottom-pinned terminal UI does not activate.
- **TTY screen mode** (`tty` block present): the harness spawns the built CLI through a pseudo-terminal, renders its output with a headless VT emulator, and asserts against the rendered screen. This exercises the full interactive TUI — raw-mode input, autocomplete, scroll regions, the pinned status line — which script mode cannot reach. See [TTY screen scenarios](#tty-screen-scenarios).

## Commands

```powershell
npm test              # build + docs check + all non-LLM scenarios including TTY + unit tests (no PTY)
npm run test:pty      # PTY driver + session manager vitest unit tests (require a PTY)
npm run eval          # build + LLM eval scenarios with detailed breakdown
```

`npm test` is the normal post-change safety check and never calls a live LLM. Use evals only when you explicitly want provider-backed tests.

## PTY unit tests

Two vitest test files exercise the PTY harness itself rather than freecode's UI:

- **`tests/harness/pty/driver.test.ts`** — unit tests for `createPtyDriver` using a minimal `node -e` subprocess. Covers: raw output capture, snapshot, transcript (scrollback), `waitForText` returning false on timeout, exit detection, `exitCode`, `kill`, and keystroke delivery. Does not require a freecode build.
- **`tests/harness/pty/session.test.ts`** — integration tests for the persistent TCP session manager (`session.ts`). Exercises the full RPC round-trip: `start` → `screen` → `send` → `stop`. Skips automatically when `dist/index.js` is absent; run `npm run build` first.

Run them with:

```powershell
npm run test:pty
```

Or as part of the full test suite (excluding PTY tests):

```powershell
npm test
```

**Windows / ConPTY gotcha**: `node -e "..."` subprocesses spawned through ConPTY crash at startup (CSPRNG init) unless the parent's full `process.env` is forwarded. Always pass `env: { ...process.env }` when creating a driver with an arbitrary node subprocess as the command.

Inside the CLI, run `/test` to open the non-LLM verification menu. Run `/eval` to list provider-backed evals, see the checks each one performs, and select one or many evals to run sequentially. `/eval` accepts numbers, names, comma/space-separated selections, and numeric ranges such as `1-3`.

For the generated scenario inventory, see [scenarios.md](scenarios.md).

## Basic Shape

```json
{
  "name": "02-eval-medium-create-files",
  "description": "Medium: create a small nested project with exact code and JSON files",
  "requiresLlm": true,
  "config": {
    "toolRationale": false,
    "useOllama": false
  },
  "workspace": "temp",
  "turns": [
    {
      "input": "Use list_dir with path \".\" first. Then use write_file to create src/math.js with content exactly \"export function sum(values) {\\n  return values.reduce((total, value) => total + value, 0);\\n}\\n\". Then use write_file to create config/app.json with content exactly \"{\\n  \\\"name\\\": \\\"eval-medium\\\",\\n  \\\"enabled\\\": true,\\n  \\\"limits\\\": {\\n    \\\"items\\\": 3\\n  }\\n}\\n\". Do not use any other tools."
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
      "sequence": ["list_dir", "write_file", "write_file"],
      "absent": ["read_file", "grep", "shell_exec"]
    }
  }
}
```

## Fields

- `name`: Stable kebab-case identifier shown in harness output.
- `description`: Human-readable purpose of the scenario.
- `requiresLlm`: Set `true` for prompts that call a provider. These are skipped by `verify` and shown under `/eval`.
- `config`: Optional temporary `config.json` contents written under the scenario's isolated `FREECODE_HOME`.
- `workspace`: Use `"temp"` for file-writing or project-mutating scenarios. Omit it or use `"repo"` for structural CLI checks.
- `filesBefore`: Optional seed files written before the CLI runs. Use with `workspace: "temp"` for edit/preservation scenarios.
- `flags`: Optional CLI flags inserted before `--script`.
- `model`: Optional model preference passed as `--model <value>`.
- `llmFixture`: Optional fake LLM script path, relative to `tests/scenarios/`. When present, set `requiresLlm: false` and use a `mock:*` model.
- `turns`: Input lines sent to script mode. Script mode exits cleanly after the final turn.
- `y`/`yes` and `n`/`no` turns are consumed as tool-call confirmations when the agent requests a tool. If the next turn is not an approval answer, the tool call is denied and the turn remains available as normal user input.
- Approval turns are skipped if there is no pending tool request, so a failed provider call does not accidentally turn `y` into a user prompt.

## Assertions

- `stdoutContains`: Substrings expected in combined stdout + stderr.
- `stdoutAbsent`: Substrings that must not appear in combined stdout + stderr.
- `exitCode`: Expected process exit code.
- `files`: File assertions relative to the scenario workspace.
- `files[].contentExact`: Exact file content. On mismatch, the harness prints the actual content.
- `toolTrace.maxCalls`: Maximum allowed tool calls.
- `toolTrace.sequence`: Exact tool call sequence.
- `toolTrace.present`: Tool names that must appear at least once.
- `toolTrace.absent`: Tool names that must not appear.
- `fakeLlmTrace.callCount`: Exact number of fake model calls.
- `fakeLlmTrace.maxCalls`: Maximum allowed fake model calls.
- `fakeLlmTrace.calls[]`: Per-call assertions for provider, model, execution path, input message count, last user text, available/absent tools, tool settings, emitted text, emitted tool calls, and usage.

## Fake LLM Fixtures

Fake LLM fixtures let a scenario enter the real agent loop without provider keys, network access, or paid usage. The harness sets `FREECODE_FAKE_LLM=1`, strips real provider API keys, passes the fixture through `FREECODE_FAKE_LLM_SCRIPT`, and does not set `FREECODE_NO_LLM=1` for that process. TTY scenarios may also set `llmFixture`; the interactive process receives the same fake-model environment so flows such as `/eval` can run in CI without live providers.

Use this mode for free verification of prompt construction, model routing, deterministic assistant text, and tool-call orchestration. The current fake runner supports ordered text/chunk responses, scripted `toolCalls`, usage metadata, strict unused-step checks, execution-setting matchers, and fake model traces. Prompt-tool fallback scripting and OpenAI Responses-style fake transports are still separate future work.

```json
{
  "name": "agent-text-fake",
  "description": "Agent loop returns deterministic text through a fake model",
  "requiresLlm": false,
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
          "toolsAvailable": ["read_file", "write_file"],
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

Fixture files are JSON and live next to scenarios:

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
        "toolsAvailable": ["read_file", "write_file"],
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
        "toolsAvailable": ["write_file"],
        "nativeToolsSupplied": true
      },
      "response": {
        "chunks": ["I'll create it."],
        "toolCalls": [
          { "name": "write_file", "args": { "path": "note.txt", "content": "ok\n" } }
        ],
        "usage": { "promptTokens": 20, "outputTokens": 5, "totalTokens": 25 }
      }
    },
    {
      "match": {
        "turn": 2,
        "messageCount": 3,
        "mustContain": ["<tool_result name=\"write_file\">"]
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

- Scenarios with `llmFixture` must set `requiresLlm: false`.
- Scenarios with `llmFixture` must use a `mock:*` model.
- `mock:*` models are rejected unless `FREECODE_FAKE_LLM=1`.
- Real providers are rejected while `FREECODE_FAKE_LLM=1`.
- Live model discovery is rejected while `FREECODE_FAKE_LLM=1`.
- Fixture steps are consumed in order; an unexpected prompt, model, missing tool, or exhausted fixture produces an explicit error.
- Unless `allowUnusedSteps` is true, all fixture steps must be consumed by the time the fake model returns a final no-tool response.
- `fakeLlmTrace` assertions read the trace written by `FREECODE_FAKE_LLM_TRACE`, so fake scenarios can verify model call count, routing, execution path, input message count, prompt-facing text, available tools, tool settings, emitted text, emitted tool calls, and usage metadata.

## TTY screen scenarios

A scenario with a top-level `tty` block is driven through a real pseudo-terminal instead of script mode, and its assertions run against the *rendered screen* (what a human would see), not raw stdout. Use this for interactive UI behavior: autocomplete, suggestion lists, the pinned input/status line, menus, and screen redraws. Nothing is reconstructed — the escape sequences the CLI emits are applied by a VT emulator (`@xterm/headless`) over a PTY (`node-pty`).

Set `requiresLlm: false` and omit `turns`/`expect`; the `tty` block fully describes the run.

```json
{
  "name": "tty-autocomplete",
  "description": "Interactive TUI: slash command suggestions and tab completion",
  "requiresLlm": false,
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
  - `waitFor`: Optional substring to await in the raw stream before asserting.
  - `screenContains` / `screenAbsent`: Substrings that must / must not appear on the rendered viewport.
  - `quietMs`: Override the per-step settle window (default `350`).
- `exit`: Keystrokes sent after the last step to end the process. Default `"\u0003"` (Ctrl-C); the CLI has no `/exit` command.
- `expectExit`: Require the process to exit after `exit`.
- `exitCode`: Expected exit code when it exits.
- `mask`: Optional regex strings stripped from the screen before substring checks, for volatile content (e.g. token counts).

Use `npm run pty:session` to drive the live CLI interactively and print the rendered screen after each step — the fastest way to visually verify a UI change without writing a full scenario file:

```bash
ID=$(npm run pty:session -- start 2>&1 | grep SESSION_ID | cut -d= -f2)
printf '/model' | npm run pty:session -- send "$ID" -   # type command
printf '\r'     | npm run pty:session -- send "$ID" -   # submit
npm run pty:session -- stop "$ID"
```

See `docs/pty-session.md` for the full reference, control character table, and common patterns.

Run `npx tsx tests/harness/pty/demo.ts` for a fixed startup-through-`/clear` walkthrough. The harness driver lives in `tests/harness/pty/driver.ts` and the scenario runner in `tests/harness/pty/run-tty-scenario.ts`.

## Guidelines

- Prefer `workspace: "temp"` for agent tasks that create or edit files.
- Keep LLM assertions structural and outcome-based. Check files, tool trace, and broad output markers instead of exact assistant prose.
- Use exact file assertions for deterministic artifacts.
- Use tool trace assertions to catch inefficient behavior, but avoid overfitting unless the workflow truly requires a specific sequence.
- Include only the tool approval turns you expect the scenario to need. Extra unexpected tool calls will be denied unless followed by another `y`/`yes`.
- Keep each scenario focused on one user-visible behavior.

## Gotchas

- LLM eval scenarios make real provider network calls. Fake LLM fixture scenarios do not. In sandboxed Codex runs, rerun only provider-backed evals with escalated network permissions if they fail with `EACCES` / `Cannot connect to API`.
- Groq tool-call failures can surface as `code: "tool_use_failed"` and may be followed by Windows exit code `3221226505` (`0xC0000409`) if the child process aborts during shutdown. Treat the provider error as the root cause; the exit code is a secondary crash symptom.
- For tool scenarios, write prompts that name the expected tool sequence and exact tool arguments. This reduces malformed provider tool calls and keeps trace assertions meaningful.
