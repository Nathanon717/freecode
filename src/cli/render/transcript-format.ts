/**
 * @role Pure transcript formatters — value in, styled string out. No stream, no
 * state.
 *
 * @readwhen
 * changing what a tool call line, rationale, result preview, created
 * file, edit diff, prompt echo or step divider *looks* like.
 */

// Pure transcript formatters: value in, styled string out. No stream, no state.
//
// Split from transcript-renderer.ts, which owns the turn/step state machine and
// the writing — these are the pieces that decide what a tool call line, a result
// preview, an edit diff or a prompt echo *looks* like. Keeping them free of
// output means the live path, the /renderer demo and the post-wipe replay all
// produce byte-identical text from the same inputs.
//
// transcript-renderer.ts re-exports everything here, so callers keep importing
// from the one place.

import chalk from "chalk";
import { getBannerColor } from "./banner.js";
import { computeLineDiff } from "../../util/line-diff.js";
import { withLineNumbers } from "../../util/line-numbers.js";
import { fitLinesToRows } from "../../util/wrap-rows.js";
import {
  DEFAULT_TRANSCRIPT_MAX_RESULT_LINES,
  TRANSCRIPT_DIVIDER_WIDTH,
  getTranscriptStream,
  type TranscriptRenderOptions,
  type TranscriptRuntimeOptions,
} from "./transcript-options.js";

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

/** Like `formatToolCallLine`, prefixed with `~ `. */
export function formatParsedToolCallLine(
  name: string,
  args: Record<string, unknown>,
): string {
  return getBannerColor()(
    `~ ${displayName(name)}(${formatArgs(filterArgs(name, args))})`,
  );
}

/**
 * The `> ` echo of a submitted prompt. Shared by the raw-mode input UI, which
 * prints it live, and the replay, which reprints it — so the two cannot drift.
 * `eol` exists because raw mode needs an explicit carriage return (`\r\n`).
 * Continuation lines are indented two spaces.
 */
export function formatPromptEcho(text: string, eol: string = "\n"): string {
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? getBannerColor()("> ") : "  ") + line)
    .join(eol);
}

export function formatToolErrorLine(name: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return chalk.red(`${name}() failed: ${msg}`);
}

const END_OF_FILE_SUFFIX = /\n\n\(End of file — total \d+ lines\.\)$/;

/** Dim, indent, and truncate preview lines — the shared 2-space indent + truncation footer. */
function renderDimmedLines(lines: string[], options: TranscriptRenderOptions): string {
  const maxLines = options.maxResultLines ?? DEFAULT_TRANSCRIPT_MAX_RESULT_LINES;
  let shown = maxLines === Infinity ? lines : lines.slice(0, maxLines);
  if (options.maxResultRows !== undefined) {
    shown = fitLinesToRows(shown, options.maxResultRows, (l) => "  " + l);
  }
  const indented = shown.map((l) => chalk.dim("  " + l)).join("\n");
  const remaining = lines.length - shown.length;
  return remaining > 0
    ? indented + chalk.dim(`\n  ... (${remaining} more lines)`)
    : indented;
}

/**
 * Honours `maxResultLines` and `maxResultRows`, trimming via `fitLinesToRows`
 * against the rendered (gutter + colour) width and reporting the dropped count in
 * a "… (N more lines)" footer.
 */
export function formatToolResultPreview(
  result: unknown,
  options: TranscriptRenderOptions = {},
): string {
  const raw = typeof result === "string" ? result : (JSON.stringify(result, null, 2) ?? "");
  const trimmed = raw.trimEnd().replace(END_OF_FILE_SUFFIX, "");
  return trimmed ? renderDimmedLines(trimmed.split("\n"), options) : "";
}

/**
 * Create-file preview: the read tool's line-number gutter from line 1, so create
 * and read read alike, then dimmed and truncated like `formatToolResultPreview`.
 */
export function formatCreatedFileContent(
  content: string,
  options: TranscriptRenderOptions = {},
): string {
  const body = content.endsWith("\n") ? content.slice(0, -1) : content;
  return renderDimmedLines(withLineNumbers(1, body.split("\n")), options);
}

function splitDiffLines(text: string): string[] {
  const lines = text.split("\n");
  return lines.length > 0 && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
}

/**
 * Smart diff renderer: red/green for changed lines, dim for file context. Every
 * line carries a dim right-aligned line-number gutter starting at `startLine`
 * (removed lines keep old-file numbers, everything else new-file numbers), in the
 * same format `read`/`create` use via `util/line-numbers.ts`. Honours
 * `maxResultLines` and `maxResultRows` the same way `formatToolResultPreview`
 * does: `edit` (like `create`) previews its diff before confirmation, so a long
 * change must still fit the approval row budget or it scrolls the call line the
 * user is approving off-screen.
 */
export function formatEditFileDiff(
  _path: string,
  oldText: string,
  newText: string,
  contextBefore: string[] = [],
  contextAfter: string[] = [],
  options: TranscriptRenderOptions = {},
  lineIndent: string = "",
  startLine: number = 1,
): string {
  const diff = computeLineDiff(splitDiffLines(oldText), splitDiffLines(newText));
  type LineType = "context" | "remove" | "add" | "equal";
  // Gutter number: old-file line for removals, new-file line otherwise. Two
  // counters walk in lockstep so removed lines keep their old-file number.
  const lines: { text: string; type: LineType; num: number }[] = [];
  let oldNo = startLine;
  let newNo = startLine;
  for (const l of contextBefore) { lines.push({ text: " " + l, type: "context", num: newNo }); oldNo++; newNo++; }
  for (const e of diff) {
    if (e.type === "remove") lines.push({ text: "-" + lineIndent + e.text, type: "remove", num: oldNo++ });
    else if (e.type === "add") lines.push({ text: "+" + lineIndent + e.text, type: "add", num: newNo++ });
    else { lines.push({ text: " " + lineIndent + e.text, type: "equal", num: newNo }); oldNo++; newNo++; }
  }
  for (const l of contextAfter) { lines.push({ text: " " + l, type: "context", num: newNo }); oldNo++; newNo++; }

  const maxLines = options.maxResultLines ?? DEFAULT_TRANSCRIPT_MAX_RESULT_LINES;
  let shown = maxLines === Infinity ? lines : lines.slice(0, maxLines);
  // Gutter width from the line-count slice; the 1-2 col variance a later row-fit
  // could shave off doesn't change wrap math, so compute it once up front.
  const width = shown.reduce((w, e) => Math.max(w, String(e.num).length), 1);
  const renderEntry = ({ text, type, num }: (typeof lines)[number]): string => {
    const gutter = chalk.dim(`${String(num).padStart(width)}: `);
    const colored =
      type === "remove" ? chalk.red(text)
      : type === "add" ? chalk.green(text)
      : type === "equal" ? chalk.magentaBright(text)
      : chalk.dim(text);
    return "  " + gutter + colored;
  };
  // On the approval path the diff must also fit a wrapped-row budget, so the
  // header the user is approving stays on screen; measure what actually lands.
  if (options.maxResultRows !== undefined) {
    shown = fitLinesToRows(shown, options.maxResultRows, renderEntry);
  }
  const formatted = shown.map(renderEntry).join("\n");

  const remaining = lines.length - shown.length;
  return remaining > 0
    ? formatted + chalk.dim(`\n  ... (${remaining} more lines)`)
    : formatted;
}

/**
 * One raw divider line, no surrounding newlines — `writeStepSeparator` in the
 * renderer owns those. Uses the target stream's column width when `options` is given.
 */
export function formatTranscriptStepDivider(options?: TranscriptRuntimeOptions): string {
  const stream = options ? getTranscriptStream(options) : process.stdout;
  const tty = stream as NodeJS.WriteStream;
  const envCols = parseInt(process.env["COLUMNS"] ?? "0", 10);
  const width = tty.columns || process.stdout.columns || envCols || TRANSCRIPT_DIVIDER_WIDTH;
  return getBannerColor()("─".repeat(width));
}
