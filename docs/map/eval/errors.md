# src/eval/errors.ts - Eval API Error Parser

**Role:** Parses structured API error objects out of eval run stdout for display after a failed eval.

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

## How It Works

`extractApiErrors` strips ANSI escape codes, then uses a regex to find `Error: {` anchors. For each anchor it uses a bracket-balanced JSON scanner (`parseJsonAt`) to extract the object without `JSON.parse` on the full string. If the parsed object has an `error` sub-key, that is used as the error source; otherwise the top-level object is used. A `tool_use_failed` diagnosis is synthesised when the code matches but `failed_generation` is absent.

## Read When

- Modifying how API errors are surfaced in the eval output.
- Adding new provider-specific error field extraction.
