# src/eval/humaneval-data.ts - HumanEval Dataset Loader

**Role:** Owns the HumanEval dataset concern for the `/eval` HumanEval tab: resolving the dataset path (`humanEvalDatasetPath`), downloading it if missing (`ensureHumanEvalDataset`/`downloadFile`), and parsing it into `HumanEvalProblem[]` (`loadHumanEvalProblems`). Defines the `HumanEvalProblem`/`HumanEvalResultMap` types consumed by the tab/run loop. Counterpart of `eval/custom.ts` (scenario discovery for the Custom tab).

**Read when:** Changing dataset location/format, download/redirect behavior, the example-problem prepend, or the `HUMANEVAL_DATA` / `HUMANEVAL_EXAMPLE_DATA` env overrides (test fixtures).

**Key neighbors:**
- `src/cli/eval/humaneval-menu.ts` — the tab + run loop that consume the problems and types
- `src/cli/eval/eval-menu.ts` — calls `humanEvalDatasetPath`/`loadHumanEvalProblems` to populate the tab
- `src/eval/custom.ts` — the Custom-tab counterpart (scenario discovery)
- `evals/humaneval/data/` — bundled dataset (`HumanEval.jsonl.gz`, `example_problem.jsonl`); gitignored under `evals/*`
- `tests/e2e/humaneval-mini.jsonl.gz`, `tests/e2e/humaneval-example.jsonl` — fixtures pointed at via env overrides

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
downloadFile(url: string, dest: string): Promise<void>

type HumanEvalResultMap = Record<string, 'pass' | 'fail'>;

interface HumanEvalProblem {
  task_id: string;
  prompt: string;
  canonical_solution: string;
  test: string;
  entry_point: string;
}

humanEvalDatasetPath(): string

ensureHumanEvalDataset(downloadFn?: (url: string, dest: string) => Promise<void>): Promise<boolean>

loadHumanEvalProblems(): HumanEvalProblem[] | null
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`util/text-encoding.ts`](../util/text-encoding.md) ×2
- **Imported by:** [`cli/eval/humaneval-menu.ts`](../cli/eval/humaneval-menu.md) ×10, [`cli/eval/eval-menu.ts`](../cli/eval/eval-menu.md) ×5

## Tests

`tests/eval/humaneval-data.test.ts`. 2 other test files reference it.

## Budget

98 / 500 lines (402 to spare).

## Env

`HUMANEVAL_DATA`, `HUMANEVAL_EXAMPLE_DATA`
<!-- END GENERATED MAP FACTS -->

## Export notes

- `downloadFile` follows 301/302 redirects and rejects on non-200 status or stream errors; `ensureHumanEvalDataset` accepts an injectable `downloadFn` so tests can stub the network.
- `humanEvalDatasetPath` honors the `HUMANEVAL_DATA` env override, falling back to the bundled default; `loadHumanEvalProblems` additionally honors `HUMANEVAL_EXAMPLE_DATA` and prepends the example problem when present.
