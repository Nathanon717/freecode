# src/eval/runner.ts - Eval Subprocess Runner

**Role:** Spawns freecode as a child process for eval scenarios, manages eval file I/O, and runs the check script.

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

interface EvalReport { scenarioId: string; checks: EvalCheckResult[]; }

loadEvalConfig(scenarioDir: string): EvalConfig

archiveEvalRun(scenarioDir: string, model: string, result: EvalRunResult): void

resetEvalWorkDir(scenarioDir: string): void

startEvalScenario(scenarioDir: string, prompt: string, model?: string | undefined): CancellableEval

runCheckScript(scenarioId: string, scenarioDir: string, result: EvalRunResult): EvalReport
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `EvalReport`: Output of `run-check.ts` — scenario id and array of `EvalCheckResult`.
- `loadEvalConfig`: Reads `eval.config.json`; returns `{}` on missing or parse error.
- `startEvalScenario`: Returns a `CancellableEval` with a promise, cancel function, and paths to the live status files.
- `resetEvalWorkDir`: Wipes and re-seeds `work/` and `.run/` from `start/`.
- `archiveEvalRun`: Copies `work/` and result JSON to `.artifacts/{modelSlug}/`.
- `runCheckScript`: Writes result to `.run/result-input.json`, runs `run-check.ts` via `tsx`; throws on failure.

## Key Facts

- Spawns `dist/index.js` (not `src/`) — requires a prior build.
- Sets `FREECODE_TRANSCRIPT_STREAM=stdout` so the transcript formatter runs inside the subprocess.
- 120-second hard timeout per run via `setTimeout`.
- Imports `modelSlug` from `./custom.js` and `EvalCheckResult` from `./history.js`.

## Read When

- Changing eval subprocess environment variables, timeout, or stream handling.
- Modifying how eval results are archived or persisted.
- Debugging the check script runner.
