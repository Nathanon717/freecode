import { terminalColumns, visualRows } from "../../util/wrap-rows.js";
import {
  getTranscriptRuntimeOptions,
  getTranscriptStream,
  type TranscriptRuntimeOptions,
} from "./transcript-options.js";
import {
  formatCreatedFileContent,
  formatEditFileDiff,
  formatParsedToolCallLine,
  formatRationaleLine,
  formatToolCallLine,
  formatToolErrorLine,
  formatToolResultPreview,
  formatTranscriptStepDivider,
} from "./transcript-format.js";
import {
  recordTranscriptStepEnd,
  recordTranscriptText,
  recordTranscriptToolCall,
  recordTranscriptToolResult,
} from "./transcript-record.js";
export type { DiffEntry } from "../../util/line-diff.js";
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
export {
  filterArgs,
  formatArgs,
  formatCreatedFileContent,
  formatEditFileDiff,
  formatParsedToolCallLine,
  formatPromptEcho,
  formatRationaleLine,
  formatToolCallLine,
  formatToolErrorLine,
  formatToolResultPreview,
  formatTranscriptStepDivider,
} from "./transcript-format.js";


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
 * Write a chunk of model text: to the screen, to the step state machine, and to
 * the transcript record. `chunk` must be the text exactly as it appears — already
 * markdown-rendered — because the record replays it verbatim.
 *
 * Goes through the transcript stream like every other transcript write. It used to
 * hardcode `process.stdout`, from when the stream defaulted to stderr and model
 * text had to escape that; now stdout *is* the default, so the only stream this
 * respects that it previously ignored is `null` — which has to silence model text
 * too, or `-p` prints the response twice (once streamed here, once from
 * `result.text`). The record/notify hooks still fire: they are in-memory state for
 * replay, not output.
 */
export function writeTranscriptText(
  chunk: string,
  options: TranscriptRuntimeOptions = getTranscriptRuntimeOptions(),
): void {
  if (!chunk) return;
  getTranscriptStream(options).write(chunk);
  notifyTranscriptChunk(chunk);
  recordTranscriptText(chunk);
}

/**
 * Drop the turn/step state so a replay starts from a clean slate instead of
 * inheriting the divider the last live turn deferred. `pendingDivider` restores
 * it afterwards, leaving the machine as a completed turn would.
 */
export function resetTranscriptTurnState(pendingDivider: boolean = false): void {
  _step.open = false;
  _resetStepContent();
  _pendingDivider = pendingDivider;
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
  recordTranscriptStepEnd(hasMore);
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
  | { kind: "error"; error: unknown }
  /**
   * An already-rendered preview block, written verbatim. Only the transcript
   * record produces these: it stores the block that was put on screen rather
   * than the raw result behind it, so a replayed body is byte-identical (and
   * bounded — see cli/render/transcript-record.ts).
   */
  | { kind: "preformatted"; text: string };

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
  recordTranscriptToolCall(step);
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
  if (result.kind === "preformatted") {
    preview = result.text;
  } else if (result.kind === "edit-diff") {
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
  recordTranscriptToolResult({ kind: "preformatted", text: preview });
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
    const line = formatToolErrorLine(name, result.error);
    getTranscriptStream(runtimeOpts).write(line + "\n");
    recordTranscriptToolResult({ kind: "preformatted", text: line });
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
