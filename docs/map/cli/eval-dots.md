# src/cli/eval-dots.ts - Eval Dots Utilities

**Role:** Shared eval-status logic used by the scenario menu and the model picker to compute and render colored status circles for playground eval scenarios.

## Exports

| Symbol | Description |
|--------|-------------|
| `PLAYGROUND_EVAL_DIR` | Absolute path to `playground/eval/`. |
| `EVAL_RESULTS_DIR` | Absolute path to `playground/eval/results/`. |
| `EvalStatus` | `'grey' \| 'green' \| 'red' \| 'orange'` — status values for a single scenario run. |
| `EvalCheckResult` | Shape of one check in a stored grading breakdown (assertion/stat/warning). |
| `EvalHistoryEntry` | Shape of one entry in a per-model results JSON file. Now includes optional `checks` (grading breakdown) and uses `computeRunHash` as `scenarioHash` for new entries. |
| `ScenarioHashes` | `{ runHash, fullHash }` pair stored in `EvalDotsData.hashes`. |
| `PlaygroundScenario` | `{ id, firstLine }` for a discovered playground scenario. |
| `EvalDotsData` | Precomputed bundle returned by `loadEvalDotsData()`. |
| `modelSlug(model)` | Converts `provider:model` to `provider--model` for use as a filename. |
| `modelResultFile(model)` | Returns the absolute path to the per-model results JSON file. |
| `loadModelResults(model)` | Reads and parses a per-model results file; returns `[]` on missing/error. |
| `loadEvalHistory()` | Returns `EvalHistoryEntry[]`. After Phase 3: reads from the in-memory DB cache (via `getCache()` from `db.ts`) when `initStore()` has been called; falls back to `playground/eval/results/*.json` files otherwise. |
| `discoverPlaygroundScenarios()` | Lists numbered scenario folders in `playground/eval/` that have `prompt.md` and `eval/check.ts`, sorted by name. |
| `computeRunHash(scenarioDir)` | Hashes only prompt, config, and start files — excludes eval/ so scoring changes don't invalidate stored results. Used as `scenarioHash` for new entries. |
| `computeScenarioHash(scenarioDir)` | Full hash including eval/ files. Retained for grandfathering entries written before the run-hash split. |
| `getEquivalentModels(model, groups)` | Resolves the canonical group members for a model, or returns a singleton set. |
| `getEvalStatus(scenarioId, runHash, model, history, groups, legacyFullHash?)` | Determines the status circle color. Matches on runHash; also accepts legacyFullHash for grandfathering old entries. |
| `getLatestEvalEntry(scenarioId, runHash, model, history, groups, legacyFullHash?)` | Returns the most recent matching `EvalHistoryEntry` or null. |
| `statusCircle(status)` | Returns a chalk-colored `●` string for an `EvalStatus`. |
| `loadEvalDotsData()` | Convenience: discovers scenarios, hashes them all, and loads all history in one call. |
| `buildEvalDots(model, data, groups)` | Returns a compact string of colored circles, one per scenario in discovery order. |

## Key Neighbors

- Read by `cli/scenario-menu.ts` (scenario menu display) and `commands/model.ts` (model picker dots).
- `getEvalStatus` re-exports canonical-group logic from `providers/canonical-models.ts`.

## Update Triggers

- When the eval history format or file layout changes.
- When scenario hash inputs change (new files included, line-ending handling, run vs. full hash split).
- When `statusCircle` color mapping changes.
- When `EvalCheckResult` shape changes (must stay in sync with `playground/eval/shared/types.ts`).
