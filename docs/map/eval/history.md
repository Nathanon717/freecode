# src/eval/history.ts - Eval History and Status Computation

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Loads eval history from the DB cache, computes per-scenario eval status, and provides the bulk data bundle used by the model picker and eval menus.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type EvalStatus = 'grey' | 'green' | 'red' | 'orange';

interface EvalCheckResult {
  name: string;
  kind: 'assertion' | 'stat' | 'warning';
  pass?: boolean;
  message?: string;
  value?: string | number;
  note?: string;
}

interface EvalHistoryEntry {
  timestamp: string;
  scenarioId: string;
  model: string;
  pass: boolean;
  warnings?: boolean;
  tokens: { total: number; prompt?: number; output?: number };
  scenarioHash?: string;
  checks?: EvalCheckResult[];
}

interface ScenarioHashes { runHash: string; fullHash: string; }

interface EvalDotsData {
  scenarios: CustomEval[];
  hashes: Map<string, ScenarioHashes>;
  history: EvalHistoryEntry[];
}

/**
 * Every stored history entry; `[]` when the DB is not yet initialized.
 */
loadEvalHistory(): EvalHistoryEntry[]

/**
 * Matches on `runHash`; `legacyFullHash` grandfathers entries written before the run-hash split.
 */
getEvalStatus(scenarioId: string, runHash: string, model: string, history: EvalHistoryEntry[], legacyFullHash?: string | undefined): EvalStatus

getLatestEvalEntry(scenarioId: string, runHash: string, model: string, history: EvalHistoryEntry[], legacyFullHash?: string | undefined): EvalHistoryEntry | null

/**
 * Convenience bundle: discovers scenarios via `custom.ts`, hashes them all, and loads all history.
 */
loadEvalDotsData(): EvalDotsData
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`eval/custom.ts`](custom.md) ×5, [`store/db.ts`](../store/db.md) ×1
- **Imported by:** [`cli/eval/eval-screen.ts`](../cli/eval/eval-screen.md) ×9, [`cli/eval/custom-eval-menu.ts`](../cli/eval/custom-eval-menu.md) ×3, [`cli/eval/eval-dots.ts`](../cli/eval/eval-dots.md) ×3, [`cli/eval/eval-menu.ts`](../cli/eval/eval-menu.md) ×3, [`commands/model.ts`](../commands/model.md) ×2, [`eval/runner.ts`](runner.md) ×1

## Tests

`tests/eval/history.test.ts`. 5 other test files reference it.

## Budget

116 / 500 lines (384 to spare).
<!-- END GENERATED MAP FACTS -->

## Notes

`EvalCheckResult` must stay in sync with `evals/custom/shared/types.ts` — a file outside
`src/`, so nothing in the import graph will flag the drift.
