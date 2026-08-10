/**
 * @role Resolves where transcript output goes and how much of a tool result it may show. Split from `transcript-renderer.ts` so both it and anything else needing these can share them without importing the renderer's state machine back — a cycle. The renderer re-exports every name here, so prefer importing from `transcript-renderer.js` over reaching in directly.
 *
 * @readwhen
 * - Changing transcript stream routing or result-preview truncation policy.
 */

import { Writable } from "stream";

/**
 * Transcript output goes to stdout. There is deliberately no stderr option:
 * `writeTranscriptText` carries the model's own response text, not just tool
 * chatter, so routing the transcript to stderr put the whole payload on the
 * error stream. `null` silences it instead — used by headless callers that
 * print the final response themselves (`-p`) and by unit tests.
 */
export type TranscriptStreamName = "stdout" | "null";

const nullStream = new Writable({
  write(_, __, cb) {
    cb();
  },
});

export interface TranscriptRenderOptions {
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

export interface TranscriptRuntimeOptions extends TranscriptRenderOptions {
  stream: TranscriptStreamName;
}

export const DEFAULT_TRANSCRIPT_MAX_RESULT_LINES = 30;
/** A fallback only, kept for tests; the runtime divider uses the real terminal width. */
export const TRANSCRIPT_DIVIDER_WIDTH = 60;

function parseMaxResultLines(raw: string | undefined): number {
  if (!raw) return DEFAULT_TRANSCRIPT_MAX_RESULT_LINES;
  if (raw.toLowerCase() === "all" || raw.toLowerCase() === "infinity")
    return Infinity;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : DEFAULT_TRANSCRIPT_MAX_RESULT_LINES;
}

/**
 * `FREECODE_TRANSCRIPT_STREAM` only distinguishes "show it" from `null`, which
 * silences the transcript; any unrecognised value is stdout. Unit tests set
 * `null` suite-wide (`vitest.config.ts`), and `-p` sets it because it prints the
 * final response itself.
 */
export function getTranscriptRuntimeOptions(
  env: NodeJS.ProcessEnv = process.env,
): TranscriptRuntimeOptions {
  const raw = env["FREECODE_TRANSCRIPT_STREAM"];
  const stream: TranscriptStreamName = raw === "null" ? "null" : "stdout";
  return {
    stream,
    maxResultLines: parseMaxResultLines(
      env["FREECODE_TRANSCRIPT_MAX_RESULT_LINES"],
    ),
  };
}

export function getTranscriptStream(
  options: TranscriptRuntimeOptions = getTranscriptRuntimeOptions(),
): NodeJS.WritableStream {
  return options.stream === "null" ? nullStream : process.stdout;
}
