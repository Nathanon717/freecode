# src/eval/history.ts - Eval History and Status Computation

**Role:** Loads eval history from the DB cache, computes per-scenario eval status, and provides the bulk data bundle used by the model picker and eval menus.

## Exports

| Symbol | Description |
|--------|-------------|
| `EvalStatus` | `'grey' \| 'green' \| 'red' \| 'orange'` — status values for a single scenario run. |
| `EvalCheckResult` | Shape of one check in a stored grading breakdown (assertion/stat/warning). |
| `EvalHistoryEntry` | Shape of one history entry (timestamp, scenarioId, model, pass, tokens, etc.). Includes optional `checks` and `scenarioHash`. |
| `ScenarioHashes` | `{ runHash, fullHash }` pair. |
| `EvalDotsData` | Precomputed bundle: scenarios, hashes map, and history array. |
| `loadEvalHistory()` | Returns `EvalHistoryEntry[]` from the in-memory DB cache. Returns `[]` if the DB is not yet initialized. |
| `getEvalStatus(scenarioId, runHash, model, history, legacyFullHash?)` | Determines the status circle color. Matches on runHash; also accepts legacyFullHash for grandfathering old entries. |
| `getLatestEvalEntry(scenarioId, runHash, model, history, legacyFullHash?)` | Returns the most recent matching `EvalHistoryEntry` or null. |
| `loadEvalDotsData()` | Convenience: discovers scenarios via `playground.ts`, hashes them all, and loads all history. |

## Key Neighbors

- Imports scenario discovery and hashing from [playground.md](playground.md).
- `EvalCheckResult` shape must stay in sync with `playground/eval/shared/types.ts`.
- Consumed by `cli/eval-menu.ts`, `cli/eval-screen.ts`, `cli/scenario-menu.ts`, and `commands/model.ts`.

## Update Triggers

- When the eval history format or DB cache structure changes.
- When `EvalCheckResult` shape changes.
- When the status color mapping logic changes.
