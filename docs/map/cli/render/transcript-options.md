# src/cli/render/transcript-options.ts - Transcript Stream + Options

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Resolves where transcript output goes and how much of a tool result it may show. Split from `transcript-renderer.ts` so both it and anything else needing these can share them without importing the renderer's state machine back — a cycle. The renderer re-exports every name here, so prefer importing from `transcript-renderer.js` over reaching in directly.

## Read When

- Changing transcript stream routing or result-preview truncation policy.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Transcript output goes to stdout. There is deliberately no stderr option:
 * `writeTranscriptText` carries the model's own response text, not just tool
 * chatter, so routing the transcript to stderr put the whole payload on the
 * error stream. `null` silences it instead — used by headless callers that
 * print the final response themselves (`-p`) and by unit tests.
 */
type TranscriptStreamName = "stdout" | "null";

interface TranscriptRenderOptions {
  /**
   * The stable default (30, `all` for unbounded), driven by
   * `FREECODE_TRANSCRIPT_MAX_RESULT_LINES`. Applies alongside `maxResultRows`;
   * whichever trims first wins.
   */
  maxResultLines?: number;
  /**
   * Hard cap on the terminal rows the preview block may occupy, counting line
   * wrap. Only the pending-approval preview sets this (see agent/tools/index.ts):
   * it keeps the block short enough that the tool call header written just above
   * stays on screen once the approval hint draws. Unset everywhere else, which
   * leaves maxResultLines as the sole limit.
   */
  maxResultRows?: number;
}

interface TranscriptRuntimeOptions extends TranscriptRenderOptions {
  stream: TranscriptStreamName;
}

DEFAULT_TRANSCRIPT_MAX_RESULT_LINES: 30

/**
 * A fallback only, kept for tests; the runtime divider uses the real terminal width.
 */
TRANSCRIPT_DIVIDER_WIDTH: 60

/**
 * `FREECODE_TRANSCRIPT_STREAM` only distinguishes "show it" from `null`, which
 * silences the transcript; any unrecognised value is stdout. Unit tests set
 * `null` suite-wide (`vitest.config.ts`), and `-p` sets it because it prints the
 * final response itself.
 */
getTranscriptRuntimeOptions(env?: ProcessEnv): TranscriptRuntimeOptions

getTranscriptStream(options?: TranscriptRuntimeOptions): WritableStream
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/render/transcript-renderer.ts`](transcript-renderer.md) ×33, [`cli/render/transcript-format.ts`](transcript-format.md) ×9

## Tests

`tests/cli/render/transcript-options.test.ts`. 2 other test files reference it.

## Budget

76 / 500 lines (424 to spare).
<!-- END GENERATED MAP FACTS -->
