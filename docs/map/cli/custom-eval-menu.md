# src/cli/custom-eval-menu.ts - Custom Eval Tab + Run Loop

**Role:** Provides the **Custom** tab of the unified eval menu (`buildCustomEvalTab`) and the eval scenario run loop (`runEvalScenarios`) backed by `evals/custom/`. The `/eval` menu itself is composed in `cli/eval-menu.ts`. Delegates subprocess execution to `eval-runner.ts`, rendering to `eval-screen.ts`, error parsing to `eval-errors.ts`, and the inline action sub-menu to `action-menu.ts`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
getEvalStatus: (scenarioId: string, runHash: string, model: string, history: EvalHistoryEntry[], legacyFullHash?: string | undefined) => EvalStatus

ScenarioHashes: any

buildCustomEvalTab<R>(scenarios: CustomEval[], evalHistory: EvalHistoryEntry[], scenarioHashes: Map<string, ScenarioHashes>, getSelectedModel: () => string, choose: (scenarios: CustomEval[]) => R): MenuTab<...>

runEvalScenarios(chosen: CustomEval[], model: string): Promise<void>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `getEvalStatus` is re-exported from `cli/eval-dots.ts`.

## Custom eval tab (`buildCustomEvalTab`)

- The scenario list (discovered numbered folders in `evals/custom/`, requiring `prompt.md` + `eval/check.ts`) becomes the **Custom** tab of the unified menu (`cli/eval-menu.ts`, which discovers scenarios + history and composes the tabs). Up/Down navigate, Enter opens the Run/View/Edit action menu, `→` opens detail, `a` runs all, Esc closes.
- `renderBody` keeps a `VIEWPORT_SIZE` (20) scrolling window (closure `viewportStart`, derived from `selected` each draw, clamped for the `-1` tab-row case) so the tab bar + header stay on screen on short terminals — mirrors `buildHumanEvalTab`. The window is applied by slicing `scenarios` before `buildEvalPickerScreen` (which itself is unchanged).
- Shows one status circle per scenario from the most recent matching entry in `evals/custom/results/{model-slug}.json`, constrained by the current run hash (prompt + config + start only — not eval/) and selected model; green = latest pass, orange = pass with warnings, red = latest fail. Named canonical groups can share history; `other` is treated as unrelated. Results are stored per-model so files never conflict on `git pull`.
- The detail view (`→`) shows the stored grading breakdown (assertions, warnings, stats) from the most recent run.

## Run loop (`runEvalScenarios`)

- Resets each scenario's `work/` dir from `start/`, stores harness artifacts in sibling `.run/`, then spawns the compiled freecode agent via `--script` mode with `cwd = work/`, passing the selected model via `FREECODE_MODEL`.
- Sets `FREECODE_TRANSCRIPT_STREAM=stdout` so the captured eval run replays the same transcript formatter used by normal tool logging.
- After each successful run, archives `work/` and `EvalRunResult` to `{scenarioDir}/.artifacts/{modelSlug}/` (gitignored) so the check script can be re-run without re-running the LLM. Stores `checks: EvalCheckResult[]` in the per-model results JSON so the detail view works across sessions (grandfathering pre-run-hash-split entries via the legacy full hash).
- Dynamically imports each scenario's `eval/check.ts` to score the result and prints a pass/fail report; summarizes structured model API errors (`code`, `type`, `param`, `failed_generation`, `tool_use_failed` diagnosis).
- After each eval subprocess exits, re-reads `model-cache.json` to detect dead models written by the subprocess (e.g. nvidia 404); if dead, calls `invalidateDeadModel` to sync the main-process registry and skips saving the result to the DB.

The menu lifecycle (bottom-UI teardown/restore, raw-mode reset) is owned by `cli/menu-shell.ts` via `cli/eval-menu.ts`, not this file.
