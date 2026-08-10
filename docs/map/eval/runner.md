# src/eval/runner.ts - Eval Subprocess Runner

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Spawns freecode as a child process for eval scenarios, manages eval file I/O, and runs the check script.

## Read When

- Changing eval subprocess environment variables, timeout, or stream handling.
- Modifying how eval results are archived or persisted.
- Debugging the check script runner.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface EvalToolCall { tool: string; args: Record<string, unknown>; result?: unknown; }

interface EvalTokenUsage { total: number; prompt?: number; output?: number; }

interface EvalRunResult {
  exitCode: number; stdout: string; stderr: string;
  toolCalls: EvalToolCall[]; tokens: EvalTokenUsage; workDir: string;
  quota: unknown;
}

/**
 * Output of `run-check.ts`: the scenario id and its check results.
 */
interface EvalReport { scenarioId: string; checks: EvalCheckResult[]; }

/**
 * Reads `eval.config.json`; `{}` on a missing file or a parse error.
 */
loadEvalConfig(scenarioDir: string): EvalConfig

/**
 * Copies `work/` and the result JSON to `.artifacts/{modelSlug}/`.
 */
archiveEvalRun(scenarioDir: string, model: string, result: EvalRunResult): void

/**
 * Wipes and re-seeds `work/` and `.run/` from `start/`.
 */
resetEvalWorkDir(scenarioDir: string): void

/**
 * Starts the subprocess run: a promise, a cancel function, and the paths of the live status files.
 */
startEvalScenario(scenarioDir: string, prompt: string, model?: string | undefined): CancellableEval

/**
 * Writes the result to `.run/result-input.json` and runs `run-check.ts` via `tsx`; throws on failure.
 */
runCheckScript(scenarioId: string, scenarioDir: string, result: EvalRunResult): EvalReport
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`logger.ts`](../logger.md) ×3, [`eval/custom.ts`](custom.md) ×1, [`eval/history.ts`](history.md) ×1
- **Imported by:** [`cli/eval/custom-eval-menu.ts`](../cli/eval/custom-eval-menu.md) ×6, [`cli/eval/humaneval-menu.ts`](../cli/eval/humaneval-menu.md) ×2, [`cli/eval/eval-screen.ts`](../cli/eval/eval-screen.md) ×1

## Tests

`tests/eval/runner.test.ts`. 3 other test files reference it.

## Budget

207 / 500 lines (293 to spare).
<!-- END GENERATED MAP FACTS -->

## Key Facts

- Spawns `dist/index.js` (not `src/`) — requires a prior build.
- Sets no transcript stream: stdout is the default, which is what the captured run wants. The explicit `FREECODE_TRANSCRIPT_STREAM=stdout` it used to pass became redundant when `stderr` was dropped ([../cli/render/transcript-options.md](../cli/render/transcript-options.md)).
- 120-second hard timeout per run via `setTimeout`.
- Imports `modelSlug` from `./custom.js` and `EvalCheckResult` from `./history.js`.
