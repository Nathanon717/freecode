import chalk from "chalk";
import { Writable } from "stream";
import { getBannerColor } from "./banner.js";

export type TranscriptStreamName = "stdout" | "stderr" | "null";

const nullStream = new Writable({
  write(_, __, cb) {
    cb();
  },
});

export interface TranscriptRenderOptions {
  maxResultLines?: number;
}

export interface TranscriptRuntimeOptions extends TranscriptRenderOptions {
  stream: TranscriptStreamName;
}

export const DEFAULT_TRANSCRIPT_MAX_RESULT_LINES = 30;
export const TRANSCRIPT_DIVIDER_WIDTH = 60; // kept for tests; runtime uses terminal width

export function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([, v]) => (typeof v === "string" ? v : JSON.stringify(v)))
    .join(", ");
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
};

const TOOL_ARG_FILTERS: Record<
  string,
  (args: Record<string, unknown>) => Record<string, unknown>
> = {
  edit: ({ path }) => ({ path }),
  create: ({ path }) => ({ path }),
  list_dir: ({ path }) =>
    path === "." || path === "" || path === undefined ? {} : { path },
};

function displayName(name: string): string {
  return TOOL_DISPLAY_NAMES[name] ?? name;
}

export function filterArgs(
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  return TOOL_ARG_FILTERS[name]?.(args) ?? args;
}

export function formatRationaleLine(rationale: string): string {
  return getBannerColor()(rationale);
}

export function formatToolCallLine(
  name: string,
  args: Record<string, unknown>,
): string {
  return getBannerColor()(
    `${displayName(name)}(${formatArgs(filterArgs(name, args))})`,
  );
}

export function formatPromptToolCallLine(
  name: string,
  args: Record<string, unknown>,
): string {
  return getBannerColor()(
    `~ ${displayName(name)}(${formatArgs(filterArgs(name, args))})`,
  );
}

export function formatToolErrorLine(name: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return chalk.red(`${name}() failed: ${msg}`);
}

const END_OF_FILE_SUFFIX = /\n\n\(End of file — total \d+ lines\.\)$/;

export function formatToolResultPreview(
  result: unknown,
  options: TranscriptRenderOptions = {},
): string {
  const raw =
    typeof result === "string"
      ? result
      : (JSON.stringify(result, null, 2) ?? "");
  const trimmed = raw.trimEnd().replace(END_OF_FILE_SUFFIX, "");
  if (!trimmed) return "";

  const maxLines =
    options.maxResultLines ?? DEFAULT_TRANSCRIPT_MAX_RESULT_LINES;
  const lines = trimmed.split("\n");
  const shown = maxLines === Infinity ? lines : lines.slice(0, maxLines);
  const indented = shown.map((l) => chalk.dim("  " + l)).join("\n");

  return maxLines !== Infinity && lines.length > maxLines
    ? indented + chalk.dim(`\n  ... (${lines.length - maxLines} more lines)`)
    : indented;
}

function splitDiffLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "")
    return lines.slice(0, -1);
  return lines;
}

export type DiffEntry = { type: "equal" | "remove" | "add"; text: string };

export function computeLineDiff(
  oldLines: string[],
  newLines: string[],
): DiffEntry[] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from(
    { length: m + 1 },
    () => new Array(n + 1).fill(0) as number[],
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        oldLines[i] === newLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: DiffEntry[] = [];
  let i = 0,
    j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ type: "equal", text: oldLines[i] });
      i++;
      j++;
    } else if (i < m && (j >= n || dp[i + 1][j] >= dp[i][j + 1])) {
      result.push({ type: "remove", text: oldLines[i] });
      i++;
    } else {
      result.push({ type: "add", text: newLines[j] });
      j++;
    }
  }
  return result;
}

export function formatEditFileDiff(
  _path: string,
  oldText: string,
  newText: string,
  contextBefore: string[] = [],
  contextAfter: string[] = [],
  options: TranscriptRenderOptions = {},
  lineIndent: string = "",
): string {
  const oldLines = splitDiffLines(oldText);
  const newLines = splitDiffLines(newText);
  const diff = computeLineDiff(oldLines, newLines);

  type LineEntry = {
    text: string;
    type: "context" | "remove" | "add" | "equal";
  };
  const lines: LineEntry[] = [
    ...contextBefore.map((l) => ({ text: " " + l, type: "context" as const })),
    ...diff.map((e) => ({
      text:
        (e.type === "remove" ? "-" : e.type === "add" ? "+" : " ") +
        lineIndent +
        e.text,
      type: e.type,
    })),
    ...contextAfter.map((l) => ({ text: " " + l, type: "context" as const })),
  ];

  const maxLines =
    options.maxResultLines ?? DEFAULT_TRANSCRIPT_MAX_RESULT_LINES;
  const shown = maxLines === Infinity ? lines : lines.slice(0, maxLines);
  const formatted = shown
    .map(({ text, type }) => {
      const colored =
        type === "remove"
          ? chalk.red(text)
          : type === "add"
            ? chalk.green(text)
            : type === "equal"
              ? chalk.magentaBright(text)
              : chalk.dim(text);
      return "  " + colored;
    })
    .join("\n");

  return maxLines !== Infinity && lines.length > maxLines
    ? formatted + chalk.dim(`\n  ... (${lines.length - maxLines} more lines)`)
    : formatted;
}

export function formatTranscriptStepDivider(options?: TranscriptRuntimeOptions): string {
  const stream = options ? getTranscriptStream(options) : process.stdout;
  const tty = stream as NodeJS.WriteStream;
  const envCols = parseInt(process.env["COLUMNS"] ?? "0", 10);
  const width = tty.columns || process.stdout.columns || envCols || TRANSCRIPT_DIVIDER_WIDTH;
  return chalk.dim("─".repeat(width));
}

// ---------------------------------------------------------------------------
// Turn / step state machine
// ---------------------------------------------------------------------------
// Every agent turn is framed by an opening and closing divider. Within a turn,
// each model step may have response text and/or tool calls. This state machine
// tracks what has been written so it can insert the correct blank lines.
//
// Desired layout (per step):
//   ---
//
//   [response text]          (optional)
//
//   [rationale]              (optional; goes directly above the tool call)
//   [tool call + result]     (optional)
//
//   ---
//
// Between consecutive steps the divider is shared (close of step N = open of
// step N+1), so there are no back-to-back dividers.

interface _StepState {
  open: boolean;
  hasText: boolean;
  toolCount: number;
  textEndsWithNewline: boolean;
}

const _step: _StepState = { open: false, hasText: false, toolCount: 0, textEndsWithNewline: false };
let _pendingDivider = false;

function _resetStepContent(): void {
  _step.hasText = false;
  _step.toolCount = 0;
  _step.textEndsWithNewline = false;
}

/**
 * Open a new agent turn. Idempotent — safe to call when a turn is already open.
 * First turn emits no leading divider. Subsequent turns flush the deferred divider
 * from the previous turn's close (so it acts as a between-turn separator).
 */
export function beginTranscriptTurn(options: TranscriptRuntimeOptions = getTranscriptRuntimeOptions()): void {
  if (_step.open) return;
  _step.open = true;
  _resetStepContent();
  if (_pendingDivider) {
    _pendingDivider = false;
    getTranscriptStream(options).write(formatTranscriptStepDivider(options) + "\n\n");
  }
}

/**
 * Record that a model text chunk was written to the output stream.
 * Call once per chunk (or with the full text for non-streaming paths).
 */
export function notifyTranscriptChunk(chunk: string): void {
  if (!chunk) return;
  _step.hasText = true;
  _step.textEndsWithNewline = chunk.endsWith("\n");
}

/**
 * Write the separator immediately before a tool call line.
 * Inserts a blank line after response text (if any) and between parallel tool calls.
 */
export function writeTranscriptToolLeadIn(options: TranscriptRuntimeOptions = getTranscriptRuntimeOptions()): void {
  const stream = getTranscriptStream(options);
  if (_step.toolCount === 0) {
    if (_step.hasText) {
      // Blank line between response text and first tool call.
      // If last chunk didn't end with \n, end that line first.
      stream.write(_step.textEndsWithNewline ? "\n" : "\n\n");
    }
    // No text before first tool call: tool starts right after opening blank line.
  } else {
    // Blank line between parallel tool calls in the same step.
    stream.write("\n");
  }
  _step.toolCount++;
}

/**
 * Close the current step.
 * hasMore=true: another step follows — the divider doubles as the next step's opener.
 * hasMore=false: final step — writes only the closing divider.
 * No-op when no turn is open.
 */
export function endTranscriptStep(hasMore: boolean, options: TranscriptRuntimeOptions = getTranscriptRuntimeOptions()): void {
  if (!_step.open) return;
  const stream = getTranscriptStream(options);
  stream.write("\n"); // blank line before divider
  if (hasMore) {
    stream.write(formatTranscriptStepDivider(options) + "\n\n"); // close + open next
    _resetStepContent(); // keep _step.open = true for next step
  } else {
    // Defer the closing divider — it becomes the separator for the next turn.
    // If no next turn starts, the divider is never written (no trailing divider on last turn).
    _pendingDivider = true;
    _step.open = false;
    _resetStepContent();
  }
}

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

export function writeTranscriptStepDivider(
  options: TranscriptRuntimeOptions = getTranscriptRuntimeOptions(),
): void {
  getTranscriptStream(options).write(formatTranscriptStepDivider(options) + "\n\n");
}
