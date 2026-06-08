# src/cli/eval-errors.ts - Eval API Error Parser

**Role:** Parses structured API error objects out of eval run stdout for display after a failed eval.

## Exports

| Symbol | Description |
|--------|-------------|
| `ApiError` | Parsed API error with `message`, `code`, `type`, `param`, `failedGeneration`, and `diagnosis` fields. |
| `extractApiErrors(stdout)` | Scans ANSI-stripped stdout for `Error: {...}` patterns and extracts `ApiError[]`. |

## How It Works

`extractApiErrors` strips ANSI escape codes, then uses a regex to find `Error: {` anchors. For each anchor it uses a bracket-balanced JSON scanner (`parseJsonAt`) to extract the object without `JSON.parse` on the full string. If the parsed object has an `error` sub-key, that is used as the error source; otherwise the top-level object is used. A `tool_use_failed` diagnosis is synthesised when the code matches but `failed_generation` is absent.

## Read When

- Modifying how API errors are surfaced in the eval output.
- Adding new provider-specific error field extraction.
