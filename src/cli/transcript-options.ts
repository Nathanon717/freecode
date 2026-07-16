import { Writable } from "stream";

/**
 * Where transcript output goes and how much of a result it may show. Split from
 * transcript-renderer.ts so the renderer and anything else needing these can
 * share them without importing the renderer (and its state machine) back.
 */

export type TranscriptStreamName = "stdout" | "stderr" | "null";

const nullStream = new Writable({
  write(_, __, cb) {
    cb();
  },
});

export interface TranscriptRenderOptions {
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
export const TRANSCRIPT_DIVIDER_WIDTH = 60; // kept for tests; runtime uses terminal width

function parseMaxResultLines(raw: string | undefined): number {
  if (!raw) return DEFAULT_TRANSCRIPT_MAX_RESULT_LINES;
  if (raw.toLowerCase() === "all" || raw.toLowerCase() === "infinity")
    return Infinity;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : DEFAULT_TRANSCRIPT_MAX_RESULT_LINES;
}

export function getTranscriptRuntimeOptions(
  env: NodeJS.ProcessEnv = process.env,
): TranscriptRuntimeOptions {
  const raw = env["FREECODE_TRANSCRIPT_STREAM"];
  const stream: TranscriptStreamName =
    raw === "stdout" ? "stdout" : raw === "null" ? "null" : "stderr";
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
  if (options.stream === "null") return nullStream;
  return options.stream === "stdout" ? process.stdout : process.stderr;
}
