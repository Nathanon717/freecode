# src/eval/errors.ts - Eval API Error Parser

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Parses structured API error objects out of eval run stdout for display after a failed eval.

## Read When

- Modifying how API errors are surfaced in the eval output.
- Adding new provider-specific error field extraction.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface ApiError {
  message: string;
  code?: string;
  type?: string;
  param?: string;
  failedGeneration?: string;
  diagnosis?: string;
}

extractApiErrors(stdout: string): ApiError[]
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/eval/custom-eval-menu.ts`](../cli/eval/custom-eval-menu.md) ×1

## Tests

`tests/eval/errors.test.ts`.

## Budget

76 / 500 lines (424 to spare).
<!-- END GENERATED MAP FACTS -->

## How It Works

`extractApiErrors` strips ANSI escape codes, then uses a regex to find `Error: {` anchors. For each anchor it uses a bracket-balanced JSON scanner (`parseJsonAt`) to extract the object without `JSON.parse` on the full string. If the parsed object has an `error` sub-key, that is used as the error source; otherwise the top-level object is used. A `tool_use_failed` diagnosis is synthesised when the code matches but `failed_generation` is absent.
