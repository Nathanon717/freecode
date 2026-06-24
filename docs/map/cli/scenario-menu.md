# src/cli/scenario-menu.ts - Custom Eval Tab + Run Loop

**Role:** Provides the **Custom** tab of the unified eval menu (`buildCustomEvalTab`) and the eval scenario run loop (`runEvalScenarios`) backed by `playground/eval/`. The `/eval` menu itself is composed in `cli/eval-menu.ts`. Delegates subprocess execution to `eval-runner.ts`, rendering to `eval-screen.ts`, error parsing to `eval-errors.ts`, and the inline action sub-menu to `action-menu.ts`.

## Exports

| Symbol | Description |
|--------|-------------|
| `buildCustomEvalTab(scenarios, history, hashes, getModel, choose)` | Builds the Custom eval `MenuTab` (status circles, → detail, Run/View/Edit action menu, `a` runs all). |
| `runEvalScenarios(chosen, model)` | Runs the chosen scenarios, scores via each `eval/check.ts`, persists results, prints a summary. |
| `getEvalStatus(scenarioId, currentHash, model, history, groups)` | Re-exported from `cli/eval-dots.ts`. Computes the eval menu status circle from the most recent exact/default model history entry plus named canonical groups. |

## `/test`

- Filters summaries where `requiresLlm` is false.
- Allows one number/name choice.
- Runs the selected scenario without `--details`.
- Prints pass/fail based on harness exit status.

## Custom eval tab (`buildCustomEvalTab`)

- The scenario list (discovered numbered folders in `playground/eval/`, requiring `prompt.md` + `eval/check.ts`) becomes the **Custom** tab of the unified menu (`cli/eval-menu.ts`, which discovers scenarios + history and composes the tabs). Up/Down navigate, Enter opens the Run/View/Edit action menu, `→` opens detail, `a` runs all, Esc closes.
- Shows one status circle per scenario from the most recent matching entry in `playground/eval/results/{model-slug}.json`, constrained by the current run hash (prompt + config + start only — not eval/) and selected model; green = latest pass, orange = pass with warnings, red = latest fail. Named canonical groups can share history; `other` is treated as unrelated. Results are stored per-model so files never conflict on `git pull`.
- The detail view (`→`) shows the stored grading breakdown (assertions, warnings, stats) from the most recent run.

## Run loop (`runEvalScenarios`)

- Resets each scenario's `work/` dir from `start/`, stores harness artifacts in sibling `.run/`, then spawns the compiled freecode agent via `--script` mode with `cwd = work/`, passing the selected model via `FREECODE_MODEL`.
- Sets `FREECODE_TRANSCRIPT_STREAM=stdout` so the captured eval run replays the same transcript formatter used by normal tool logging.
- After each successful run, archives `work/` and `EvalRunResult` to `{scenarioDir}/.artifacts/{modelSlug}/` (gitignored) so the check script can be re-run without re-running the LLM. Stores `checks: EvalCheckResult[]` in the per-model results JSON so the detail view works across sessions (grandfathering pre-run-hash-split entries via the legacy full hash).
- Dynamically imports each scenario's `eval/check.ts` to score the result and prints a pass/fail report; summarizes structured model API errors (`code`, `type`, `param`, `failed_generation`, `tool_use_failed` diagnosis).
- After each eval subprocess exits, re-reads `model-cache.json` to detect dead models written by the subprocess (e.g. nvidia 404); if dead, calls `invalidateDeadModel` to sync the main-process registry and skips saving the result to the DB.

The menu lifecycle (bottom-UI teardown/restore, raw-mode reset) is owned by `cli/menu-shell.ts` via `cli/eval-menu.ts`, not this file.
