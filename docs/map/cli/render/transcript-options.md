# src/cli/render/transcript-options.ts - Transcript Stream + Options

**Role:** Resolves where transcript output goes and how much of a tool result it may show.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type TranscriptStreamName = "stdout" | "stderr" | "null";

interface TranscriptRenderOptions {
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

TRANSCRIPT_DIVIDER_WIDTH: 60

getTranscriptRuntimeOptions(env?: ProcessEnv): TranscriptRuntimeOptions

getTranscriptStream(options?: TranscriptRuntimeOptions): WritableStream
```
<!-- END GENERATED EXPORTS -->

## Export notes

- Split out of [transcript-renderer.md](./transcript-renderer.md) purely so both it and any future module can share these without importing the renderer's state machine back — a cycle. The renderer re-exports every name here, so callers keep importing from `transcript-renderer.js`; prefer that over reaching in here directly.
- `maxResultLines` vs `maxResultRows` — lines is the stable default (30, `all` for unbounded, env-driven); rows is the interactive-only wrap-aware cap set by the approval path. Both apply; whichever trims first wins.
- `TRANSCRIPT_DIVIDER_WIDTH` — a fallback only; the runtime divider uses the real terminal width.

## Read when

- Changing transcript stream routing or result-preview truncation policy.

## Key neighbors

- [transcript-renderer.md](./transcript-renderer.md) — sole consumer; re-exports this whole surface.
- [tool-approval.md](../tools/tool-approval.md) — computes the `maxResultRows` value.

## Update triggers

Update when a runtime option or the stream routing rules change.
