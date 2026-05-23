# Playground Eval Harness

**Date:** 2026-05-23

## What was built

A ground-up eval system in `playground/eval/` for measuring agent quality on isolated coding tasks. The old eval approach (LLM scenario files in `tests/scenarios/`) remains unchanged; this is a parallel, purpose-built harness with a different design philosophy.

## Design

Each scenario lives in its own numbered folder (`NNN-name/`). Inside:

```
NNN-name/
├── prompt.md     — the exact prompt sent to the agent
├── start/        — pristine starting state (copied before each run, never modified)
├── work/         — agent's live working dir (reset from start before every run)
└── eval/
    └── check.ts  — scores the result; exports check(result): EvalReport
```

Two kinds of checks:

- **`assertion`** (pass/fail) — failures show in red; determines the pass count in the run header
- **`stat`** (informational) — always shown; never affects pass/fail; used for metrics like token count and tool sequence

## Key decisions

**Separate from `tests/scenarios/`** — the old scenarios test freecode's own CLI mechanics (slash commands, TTY rendering, tool trace shape). The new eval tests agent *reasoning quality* on real tasks. Different goals, different structure.

**`start/` + `work/` split** — the agent writes into `work/`; `start/` is never touched. This makes it trivial to re-run a scenario in a clean state by just wiping and copying `start/` → `work/`.

**Path enforcement via cwd** — freecode resolves relative tool-call paths against `process.cwd()`, so setting `cwd = work/` automatically confines relative paths. Absolute path escapes are detected post-hoc by `assertStayedInWorkDir` in the eval scorer.

**`FREECODE_RESULT_JSON`** — a new env var added to `command-dispatcher.ts`. When set, each agent turn appends `{ totalTokens, promptTokens, outputTokens, providerId, modelId }` to a JSON file. The runner reads this to report token usage per scenario run.

## Files changed or created

**New (playground):**
- `playground/eval/README.md`
- `playground/eval/run.ts` — CLI entry: `npm run eval:playground [prefix]`
- `playground/eval/shared/types.ts` — `EvalRunResult`, `CheckResult`, `EvalReport`
- `playground/eval/shared/runner.ts` — `resetWorkDir()`, `runScenario()`
- `playground/eval/shared/assertions.ts` — common assertion and stat helpers
- `playground/eval/001-hello-world/prompt.md`
- `playground/eval/001-hello-world/start/.gitkeep`
- `playground/eval/001-hello-world/eval/check.ts`

**Modified (source):**
- `src/cli/command-dispatcher.ts` — adds `FREECODE_RESULT_JSON` env var support

**Modified (config):**
- `package.json` — adds `eval:playground` script
- `.gitignore` — un-ignores `playground/eval/**`, re-ignores `playground/eval/*/work/`

## Scenario 001: hello-world

Blank `start/`, prompt asks the agent to create `hello.txt` with exact contents `Hello, World!`.

Assertions:
1. `hello.txt` exists
2. Content is exactly `Hello, World!`
3. No unnecessary tools called (only `write_file` and `list_dir` are allowed)
4. All tool path args stayed inside `work/`

Stats (informational):
- Tool call sequence
- Token usage (total, prompt, output)

## Verification

`npm run verify:fast` — 9/9 scenarios pass, docs check clean, build clean.
