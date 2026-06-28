# src/eval/humaneval-data.ts - HumanEval Dataset Loader

Loads and downloads the HumanEval benchmark dataset for the `/eval` HumanEval tab.

**Purpose:** Owns the HumanEval dataset concern: resolving the dataset path (`humanEvalDatasetPath`), downloading it if missing (`ensureHumanEvalDataset`/`downloadFile`), and parsing it into `HumanEvalProblem[]` (`loadHumanEvalProblems`). Defines the `HumanEvalProblem` and `HumanEvalResultMap` types consumed by the tab/run loop. This is the HumanEval counterpart of `eval/playground.ts` (scenario discovery for the Custom tab).

**Read when:** Changing the dataset location/format, the download/redirect behavior, the example-problem prepend, or the `HUMANEVAL_DATA` / `HUMANEVAL_EXAMPLE_DATA` env overrides (used in tests to point at bundled mini fixtures).

**Key neighbors:**
- `src/cli/humaneval-menu.ts` — the tab + run loop that consume the problems and types
- `src/cli/eval-menu.ts` — calls `humanEvalDatasetPath`/`loadHumanEvalProblems` to populate the tab
- `src/eval/playground.ts` — the Custom-tab counterpart (scenario discovery)
- `playground/humaneval/data/` — bundled dataset (`HumanEval.jsonl.gz`, `example_problem.jsonl`); gitignored under `playground/*`
- `tests/scenarios/humaneval-mini.jsonl.gz`, `tests/scenarios/humaneval-example.jsonl` — fixtures pointed at via env overrides

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

## Export notes

- `downloadFile` follows 301/302 redirects and rejects on non-200 status or stream errors; `ensureHumanEvalDataset` accepts an injectable `downloadFn` so tests can stub the network.
- `humanEvalDatasetPath` honors the `HUMANEVAL_DATA` env override, falling back to the bundled default; `loadHumanEvalProblems` additionally honors `HUMANEVAL_EXAMPLE_DATA` and prepends the example problem when present.
