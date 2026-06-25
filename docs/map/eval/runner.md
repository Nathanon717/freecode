# src/eval/runner.ts - Eval Subprocess Runner

**Role:** Spawns freecode as a child process for eval scenarios, manages eval file I/O, and runs the check script.

## Exports

| Symbol | Description |
|--------|-------------|
| `EvalRunResult` | Result of one eval agent run: exit code, stdout/stderr, tool calls, token usage, work dir, quota. |
| `EvalReport` | Output of `run-check.ts`: scenario id and an array of `EvalCheckResult`. |
| `EvalToolCall` | Single tool call captured in the trace. |
| `EvalTokenUsage` | Token count breakdown from the result JSON. |
| `loadEvalConfig(scenarioDir)` | Reads `eval.config.json` from the scenario dir; returns `{}` on missing/parse error. |
| `startEvalScenario(scenarioDir, prompt, model?)` | Spawns the compiled freecode agent via `--script` mode; returns a `CancellableEval` with a promise, cancel fn, and paths to the live status files. |
| `resetEvalWorkDir(scenarioDir)` | Wipes and re-seeds `work/` and `.run/` from `start/`. |
| `archiveEvalRun(scenarioDir, model, result)` | Copies `work/` and result JSON to `.artifacts/{modelSlug}/`. |
| `runCheckScript(scenarioId, scenarioDir, result)` | Writes result JSON to `.run/result-input.json` then runs `playground/eval/run-check.ts` via `tsx`; throws on failure, returns `EvalReport`. |

## Key Facts

- Spawns `dist/index.js` (not `src/`) — requires a prior build.
- Sets `FREECODE_TRANSCRIPT_STREAM=stdout` so the transcript formatter runs inside the subprocess.
- 120-second hard timeout per run via `setTimeout`.
- Imports `modelSlug` from `./playground.js` and `EvalCheckResult` from `./history.js`.

## Read When

- Changing eval subprocess environment variables, timeout, or stream handling.
- Modifying how eval results are archived or persisted.
- Debugging the check script runner.
