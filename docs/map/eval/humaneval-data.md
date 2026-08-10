# src/eval/humaneval-data.ts - HumanEval Dataset Loader

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Owns the HumanEval dataset concern for the `/eval` HumanEval tab: resolving the dataset path (`humanEvalDatasetPath`), downloading it if missing (`ensureHumanEvalDataset`/`downloadFile`), and parsing it into `HumanEvalProblem[]` (`loadHumanEvalProblems`).

## Read When

Changing dataset location/format, download/redirect behavior, the example-problem prepend, or the `HUMANEVAL_DATA` / `HUMANEVAL_EXAMPLE_DATA` env overrides (test fixtures).
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Follows 301/302 redirects; rejects on a non-200 status or a stream error.
 */
downloadFile(url: string, dest: string): Promise<void>

type HumanEvalResultMap = Record<string, 'pass' | 'fail'>;

interface HumanEvalProblem {
  task_id: string;
  prompt: string;
  canonical_solution: string;
  test: string;
  entry_point: string;
}

/**
 * Resolved dataset path: the `HUMANEVAL_DATA` override, else the bundled default.
 */
humanEvalDatasetPath(): string

/**
 * Download the HumanEval dataset if it is missing, printing progress. Returns
 * false (after printing an error) when the download was needed and failed.
 * `downloadFn` is injectable so tests can stub the network.
 */
ensureHumanEvalDataset(downloadFn?: (url: string, dest: string) => Promise<void>): Promise<boolean>

/**
 * Load and parse the HumanEval problems. Returns null (after printing an error)
 * when the dataset cannot be read or parsed. Also honours `HUMANEVAL_EXAMPLE_DATA`,
 * prepending the example problem when it is present.
 */
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

105 / 500 lines (395 to spare).

## Env

`HUMANEVAL_DATA`, `HUMANEVAL_EXAMPLE_DATA`
<!-- END GENERATED MAP FACTS -->

## Notes

`tests/e2e/humaneval-mini.jsonl.gz` and `tests/e2e/humaneval-example.jsonl` are pointed at
through the env overrides, so fixtures outside `src/` depend on the dataset path.

It also defines the `HumanEvalProblem` / `HumanEvalResultMap` types the tab and run loop
consume. Counterpart of [custom.md](custom.md), which does scenario discovery for the
Custom tab.
