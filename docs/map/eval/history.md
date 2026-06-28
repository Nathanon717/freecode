# src/eval/history.ts - Eval History and Status Computation

**Role:** Loads eval history from the DB cache, computes per-scenario eval status, and provides the bulk data bundle used by the model picker and eval menus.

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

loadEvalHistory(): EvalHistoryEntry[]

getEvalStatus(scenarioId: string, runHash: string, model: string, history: EvalHistoryEntry[], legacyFullHash?: string | undefined): EvalStatus

getLatestEvalEntry(scenarioId: string, runHash: string, model: string, history: EvalHistoryEntry[], legacyFullHash?: string | undefined): EvalHistoryEntry | null

loadEvalDotsData(): EvalDotsData
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `loadEvalHistory()`: returns `[]` if the DB is not yet initialized.
- `getEvalStatus()`: matches on `runHash`; also accepts `legacyFullHash` for grandfathering old entries.
- `loadEvalDotsData()`: convenience bundle — discovers scenarios via `custom.ts`, hashes them all, and loads all history.

## Key Neighbors

- Imports scenario discovery and hashing from [custom.md](custom.md).
- `EvalCheckResult` shape must stay in sync with `evals/custom/shared/types.ts`.
- Consumed by `cli/eval-menu.ts`, `cli/eval-screen.ts`, `cli/custom-eval-menu.ts`, and `commands/model.ts`.

## Update Triggers

- When the eval history format or DB cache structure changes.
- When `EvalCheckResult` shape changes.
- When the status color mapping logic changes.
