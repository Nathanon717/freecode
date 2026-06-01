# Playground Eval

A ground-up eval harness for measuring agent quality on isolated coding tasks.

## Running evals

Use the `/eval` slash command inside the freecode app. It will show a list of scenarios and prompt for confirmation before running.

> **Note:** Evals call a live LLM. Do not run without asking first.

## Structure

```
playground/eval/
├── README.md              — this file
├── shared/
│   ├── types.ts           — EvalRunResult, CheckResult, EvalReport
│   └── assertions.ts      — assertion and stat helper functions
└── NNN-scenario-name/
    ├── prompt.md          — the exact prompt sent to the agent
    ├── start/             — pristine starting state (never modified)
    ├── work/              — agent's working dir (reset from start before each run)
    ├── .run/              — harness-only prompt, trace, and result artifacts
    └── eval/
        └── check.ts       — exports check(result): EvalReport
```

## How a scenario runs

1. `work/` is deleted and re-created as a copy of `start/`; `.run/` is reset for harness artifacts
2. The agent is spawned with `cwd = work/`, fed the prompt from `.run/script.txt`, and all tool calls are auto-approved
3. Tool calls are captured via `FREECODE_TRACE_JSON`; token usage via `FREECODE_RESULT_JSON`, both under `.run/`
4. `eval/check.ts` receives the full `EvalRunResult` and returns an `EvalReport`

## Path enforcement

The agent's tools resolve relative paths against `work/` (via `projectRoot = cwd`). Absolute paths are scored post-hoc: `assertStayedInWorkDir` flags any tool call whose `path` or `directory` arg points outside `work/`.

## Check types

Each check in an `EvalReport` has a `kind`:

- **`assertion`** — pass/fail with an informative failure message. Failures show in red. The pass rate is printed in the header.
- **`warning`** — pass/fail, but a failure does not count against the assertion pass rate. Shown in yellow. Use for process/methodology checks where a correct outcome can still be reached without the expected behavior.
- **`stat`** — informational only (e.g. token count, tool sequence). Always shown in the Stats section; never affects pass/fail.

## What should be a `warning` vs an `assertion`

**Use `warning`** when the check measures *how* the agent worked, not *whether* it succeeded:

| Pattern | Example checks |
|---------|---------------|
| Ran the script to observe the error before fixing | `ran failing script first`, `encountered first bug (ValueError)`, `first run exits 0 with wrong output` |
| Read/inspected relevant input files or modules before editing | `inspected input data`, `inspected stats module` |
| Used the expected tool sequence (orient → inspect → fix → verify) | Early-exit guards in cascade checks when a preceding run is not found |
| Fixed both bugs across two separate cycles rather than in one shot | `encountered second bug (StatisticsError)` |

**Use `assertion`** when a failure means the output is wrong or the agent made an incorrect change:

| Pattern | Example checks |
|---------|---------------|
| Final script produces the expected output | `script runs` |
| Required files exist with correct content | `file exists`, `file content` |
| Input/reference files were not corrupted | `preserved input data`, `preserved stats module` |
| Agent stayed within its working directory | `stayed in work dir` |
| Agent made a necessary edit at all | `edited after inspecting failure`, `no edit to pipeline.py after the KeyError` |

**Rule of thumb:** if `assertScriptRuns` passes, a failing process check should be a `warning`. If `assertScriptRuns` fails and this check directly explains *why* (e.g. the file was never edited), it should be an `assertion`.

## Writing a new scenario

1. Create `NNN-scenario-name/` (e.g. `002-edit-file/`)
2. Add `prompt.md` with the agent's task
3. Populate `start/` with any required starting files (leave empty for a blank workspace)
4. Create `eval/check.ts` exporting `check(result: EvalRunResult): EvalReport`
5. Use helpers from `shared/assertions.ts` for common checks

## Scenarios

| # | Name | Difficulty | Task |
|---|------|------------|------|
| 001 | hello-world | Trivial | Create hello.txt |
| 002 | edit-config | Easy | Change one field in config.json without touching others |
| 003 | python-missing-semicolon | Easy | Run a Python script, inspect a syntax error, fix it, and rerun |
| 004 | python-data-shape-error | Medium | Run a Python script, inspect a runtime data-shape error, fix it, and rerun |
| 005 | python-silent-wrong-output | Hard | Run a script that exits 0 but produces wrong numbers; reason about the logic bug, fix, and rerun |
| 006 | python-interface-mismatch | Hard | Run a two-file project; read both files to understand the interface contract, fix the caller to match the module |
| 007 | python-two-bug-cascade | Hard | Fix two latent bugs that surface one at a time across separate run-fail-fix cycles |
