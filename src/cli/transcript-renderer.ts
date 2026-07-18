import chalk from "chalk";
import { getBannerColor } from "./banner.js";
import { computeLineDiff } from "../util/line-diff.js";
import { withLineNumbers } from "../util/line-numbers.js";
import { fitLinesToRows, terminalColumns, visualRows } from "../util/wrap-rows.js";
import {
  DEFAULT_TRANSCRIPT_MAX_RESULT_LINES,
  TRANSCRIPT_DIVIDER_WIDTH,
  getTranscriptRuntimeOptions,
  getTranscriptStream,
  type TranscriptRenderOptions,
  type TranscriptRuntimeOptions,
} from "./transcript-options.js";
export type { DiffEntry } from "../util/line-diff.js";
// Re-exported so the renderer stays the single import site for transcript output.
export {
  DEFAULT_TRANSCRIPT_MAX_RESULT_LINES,
  TRANSCRIPT_DIVIDER_WIDTH,
  getTranscriptRuntimeOptions,
  getTranscriptStream,
} from "./transcript-options.js";
export type {
  TranscriptStreamName,
  TranscriptRenderOptions,
  TranscriptRuntimeOptions,
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

export function formatParsedToolCallLine(
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

export function formatToolResultPreview(
  result: unknown,
  options: TranscriptRenderOptions = {},
): string {
  const raw = typeof result === "string" ? result : (JSON.stringify(result, null, 2) ?? "");
  const trimmed = raw.trimEnd().replace(END_OF_FILE_SUFFIX, "");
  return trimmed ? renderDimmedLines(trimmed.split("\n"), options) : "";
}

/** Create-file preview: the read tool's line-number gutter from line 1, so create and read read alike. */
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

export function formatTranscriptStepDivider(options?: TranscriptRuntimeOptions): string {
  const stream = options ? getTranscriptStream(options) : process.stdout;
  const tty = stream as NodeJS.WriteStream;
  const envCols = parseInt(process.env["COLUMNS"] ?? "0", 10);
  const width = tty.columns || process.stdout.columns || envCols || TRANSCRIPT_DIVIDER_WIDTH;
  return getBannerColor()("─".repeat(width));
}

/**
 * Write the complete step separator block — the single authority for divider
 * spacing. The separator is a single full-width line with one blank line above
 * and one below, so content is set off from it on both sides. Every site that
 * emits a divider (between-step close, between-turn flush) routes through here so
 * the separator's look and surrounding whitespace live in exactly one place.
 */
export function writeStepSeparator(options: TranscriptRuntimeOptions = getTranscriptRuntimeOptions()): void {
  getTranscriptStream(options).write("\n" + formatTranscriptStepDivider(options) + "\n\n");
}

// ---------------------------------------------------------------------------
// Turn / step state machine
// ---------------------------------------------------------------------------
// Every agent turn is framed by an opening and closing divider. Within a turn,
// each model step may have response text and/or tool calls. This state machine
// tracks what has been written so it can insert the correct blank lines.
//
// Desired layout (per step):
//                            (blank line)
//   ===                      (one divider line)
//                            (blank line)
//   [response text]          (optional)
//
//   [rationale]              (optional; goes directly above the tool call)
//   [tool call + result]     (optional)
//                            (blank line)
//   ===
//                            (blank line)
//
// The separator is shared between consecutive steps (close of step N =
// open of step N+1). Its whitespace is owned entirely by writeStepSeparator, so
// content is set off from the separator by one blank line on both sides.

interface _StepState {
  open: boolean;
  hasText: boolean;
  toolCount: number;
  textEndsWithNewline: boolean;
  /** This step's response text as written, kept so its rendered height is measurable. */
  text: string;
}

const _step: _StepState = { open: false, hasText: false, toolCount: 0, textEndsWithNewline: false, text: "" };
let _pendingDivider = false;

function _resetStepContent(): void {
  _step.hasText = false;
  _step.toolCount = 0;
  _step.textEndsWithNewline = false;
  _step.text = "";
}

/** Rows this step's response text occupies on screen, wrap included. */
function _stepTextRows(cols: number): number {
  if (!_step.text) return 0;
  const lines = _step.text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop(); // trailing newline ends a line, it doesn't add one
  return lines.reduce((sum, line) => sum + visualRows(line, cols), 0);
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
    writeStepSeparator(options);
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
  _step.text += chunk;
}

/**
 * Write the separator immediately before a tool call line.
 * Inserts a blank line after response text (if any) and between parallel tool calls.
 * Returns the rows it advanced the cursor by, so writeToolCallHeader can report
 * the full header height.
 */
export function writeTranscriptToolLeadIn(options: TranscriptRuntimeOptions = getTranscriptRuntimeOptions()): number {
  const stream = getTranscriptStream(options);
  let rows = 0;
  if (_step.toolCount === 0) {
    if (_step.hasText) {
      // Blank line between response text and first tool call.
      // If last chunk didn't end with \n, end that line first.
      const leadIn = _step.textEndsWithNewline ? "\n" : "\n\n";
      stream.write(leadIn);
      rows = leadIn.length;
    }
    // No text before first tool call: tool starts right after opening blank line.
  } else {
    // Blank line between parallel tool calls in the same step.
    stream.write("\n");
    rows = 1;
  }
  _step.toolCount++;
  return rows;
}

/**
 * Close the current step.
 * hasMore=true: another step follows — the divider doubles as the next step's opener.
 * hasMore=false: final step — writes only the closing divider.
 * No-op when no turn is open.
 */
export function endTranscriptStep(hasMore: boolean, options: TranscriptRuntimeOptions = getTranscriptRuntimeOptions()): void {
  if (!_step.open) return;
  if (hasMore) {
    writeStepSeparator(options); // close current step + open next
    _resetStepContent(); // keep _step.open = true for next step
  } else {
    // Defer the closing separator — it becomes the separator for the next turn.
    // If no next turn starts, it is never written (no trailing separator on last turn).
    _pendingDivider = true;
    _step.open = false;
    _resetStepContent();
  }
}

// ---------------------------------------------------------------------------
// Higher-level tool-step orchestration API
// ---------------------------------------------------------------------------
// Sits on top of the low-level format helpers and state machine above.
// Both the live agent path (tools/index.ts withToolRendering) and the /renderer demo
// (commands/renderer.ts) call these functions so orchestration logic lives once.

/** A fully-decided tool result, ready to render as a preview block. */
export type ToolStepResult =
  | { kind: "text"; result: unknown }
  | { kind: "create-content"; content: string }
  | {
      kind: "edit-diff";
      path: string;
      oldText: string;
      newText: string;
      contextBefore: string[];
      contextAfter: string[];
      lineIndent: string;
      /** 1-based file line number of the first rendered line (context or diff). */
      startLine: number;
    }
  | { kind: "error"; error: unknown };

export interface ToolStep {
  name: string;
  displayArgs: Record<string, unknown>;
  rationale?: string;
  /** true → use formatParsedToolCallLine (the "~" prefix) */
  parsedTools?: boolean;
  result: ToolStepResult;
}

/** Heights of the content a tool result will be written under, in wrapped rows. */
export interface ToolCallHeaderRows {
  /** The header itself: lead-in blanks + optional rationale + the call line. */
  header: number;
  /** The model's response text directly above the header; 0 when it isn't adjacent. */
  preamble: number;
}

/** A single step within a rendered turn: optional text followed by zero or more tool calls. */
export interface RenderedStep {
  text?: string;
  tools?: ToolStep[];
}

/**
 * Write the lead-in separator, optional rationale line, and tool call line.
 * The live path calls this BEFORE executing the tool; the result is written
 * separately via writeToolStepResult after execution completes.
 *
 * Returns the heights, in wrapped terminal rows, of what now sits above the
 * result. The approval path budgets its preview against these so this header —
 * and the model's preamble explaining the call — stay on screen; see
 * agent/tools/index.ts.
 */
export function writeToolCallHeader(
  step: Pick<ToolStep, "name" | "displayArgs" | "rationale" | "parsedTools">,
  opts?: TranscriptRuntimeOptions,
): ToolCallHeaderRows {
  const runtimeOpts = opts ?? getTranscriptRuntimeOptions();
  const stream = getTranscriptStream(runtimeOpts);
  const cols = terminalColumns();
  // Measure before the lead-in, which bumps toolCount: only the step's first tool
  // call sits directly under the preamble. For a parallel call after it, the text
  // is separated by an earlier call and its result, so preserving it is hopeless.
  const preamble = _step.toolCount === 0 ? _stepTextRows(cols) : 0;
  let rows = writeTranscriptToolLeadIn(runtimeOpts);
  if (typeof step.rationale === "string") {
    const rationaleLine = formatRationaleLine(step.rationale);
    stream.write(rationaleLine + "\n");
    rows += visualRows(rationaleLine, cols);
  }
  const callLine = step.parsedTools
    ? formatParsedToolCallLine(step.name, step.displayArgs)
    : formatToolCallLine(step.name, step.displayArgs);
  stream.write(callLine + "\n");
  return { header: rows + visualRows(callLine, cols), preamble };
}

/**
 * Write the preview block for a non-error tool result (edit diff, created
 * file content, or plain text). Returns whether anything was written, so
 * callers that print a preview ahead of execution (read-only precompute) can
 * tell the later post-execution write to skip a duplicate.
 */
export function writeToolResultPreview(
  name: string,
  result: Exclude<ToolStepResult, { kind: "error" }>,
  opts?: TranscriptRuntimeOptions,
): boolean {
  const runtimeOpts = opts ?? getTranscriptRuntimeOptions();
  const stream = getTranscriptStream(runtimeOpts);
  let preview: string;
  if (result.kind === "edit-diff") {
    preview = formatEditFileDiff(
      result.path,
      result.oldText,
      result.newText,
      result.contextBefore,
      result.contextAfter,
      runtimeOpts,
      result.lineIndent,
      result.startLine,
    );
  } else if (result.kind === "create-content") {
    preview = formatCreatedFileContent(result.content, runtimeOpts);
  } else {
    preview = formatToolResultPreview(result.result, runtimeOpts);
  }
  if (preview) stream.write(preview + "\n");
  return preview.length > 0;
}

/**
 * Write the preview or error block for a completed tool call.
 * For errors, always writes the error line.
 * For successful results, writes the preview only when non-empty.
 */
export function writeToolStepResult(
  name: string,
  result: ToolStepResult,
  opts?: TranscriptRuntimeOptions,
): void {
  const runtimeOpts = opts ?? getTranscriptRuntimeOptions();
  if (result.kind === "error") {
    getTranscriptStream(runtimeOpts).write(
      formatToolErrorLine(name, result.error) + "\n",
    );
    return;
  }
  writeToolResultPreview(name, result, runtimeOpts);
}

/** Render a complete tool step: header (lead-in + call line) then result preview. */
export function renderToolStep(
  step: ToolStep,
  opts?: TranscriptRuntimeOptions,
): void {
  writeToolCallHeader(step, opts);
  writeToolStepResult(step.name, step.result, opts);
}

/**
 * Render a complete agent turn: one beginTranscriptTurn followed by one or
 * more RenderedSteps (each with optional text and zero or more tool calls),
 * each closed by endTranscriptStep.
 */
export function renderTurn(
  steps: RenderedStep[],
  opts?: TranscriptRuntimeOptions,
): void {
  const runtimeOpts = opts ?? getTranscriptRuntimeOptions();
  beginTranscriptTurn(runtimeOpts);
  const stream = getTranscriptStream(runtimeOpts);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.text) {
      stream.write(step.text);
      notifyTranscriptChunk(step.text);
    }
    for (const tool of step.tools ?? []) {
      renderToolStep(tool, runtimeOpts);
    }
    endTranscriptStep(i < steps.length - 1, runtimeOpts);
  }
}
