/**
 * @role Append-only, size-capped record of what the transcript renderer
 * actually put on screen, so a post-wipe replay can reprint the conversation
 * instead of reconstructing an approximation of it.
 *
 * @readwhen
 * changing what a replay shows, adding a write site that puts
 * conversation content on screen, or chasing a replay that renders something the
 * live paint did not.
 */

// An append-only record of what the transcript renderer actually put on screen,
// so a post-wipe replay can *reprint* the conversation rather than reconstruct an
// approximation of it.
//
// Why record instead of re-deriving from `Conversation.messages`: history stores
// a tool's result *string*, not the `oldText`/`newText` that `formatEditFileDiff`
// renders from, so a replay driven by messages alone can never reproduce a
// red/green edit diff. Recording what was rendered makes the replay identical to
// the live paint by construction — `transcript-replay.ts` re-runs the same
// `renderTurn` over the same inputs.
//
// Tool result bodies are stored already-rendered (`kind: 'preformatted'`). That
// keeps an entry bounded — the on-screen preview is capped at `maxResultLines`,
// while the raw result behind it can be megabytes — and keeps the replayed block
// byte-identical to the one that was on screen, truncation footer included. Tool
// *headers* stay structured, so a replayed call line still comes from
// `formatToolCallLine` like the live one.
//
// What is not recorded: menu chrome, approval prompts, retry countdowns and the
// rest of the ephemeral UI, which rewrite themselves with cursor motion and would
// scribble if replayed. The record holds the conversation — prompts, model text,
// tool calls and their results — which is what a wipe must not appear to destroy.

import type { RenderedStep, ToolStep, ToolStepResult } from './transcript-renderer.js';

/** One replayable unit: a submitted prompt, or a whole agent turn. */
export type TranscriptEntry =
  | { kind: 'prompt'; text: string; size: number }
  | { kind: 'turn'; steps: RenderedStep[]; size: number };

/**
 * Rendered characters kept before the oldest entries are dropped. Everything
 * above the fold lands in scrollback the terminal keeps anyway, so this only has
 * to cover enough screens to make the wipe invisible — not the whole session.
 */
const MAX_RECORD_CHARS = 256_000;

const entries: TranscriptEntry[] = [];
let totalChars = 0;
let dropped = 0;

// The turn/step/tool currently being written. Held by reference, so a streamed
// chunk or a late-arriving tool result lands on the entry already in `entries`.
let openTurn: { kind: 'turn'; steps: RenderedStep[]; size: number } | null = null;
let openStep: RenderedStep | null = null;
let openTool: ToolStep | null = null;

/** Suspended while `replayTranscript` re-renders, so a replay is not itself recorded. */
let recording = true;

export function setTranscriptRecording(on: boolean): void {
  recording = on;
}

export interface TranscriptRecord {
  entries: readonly TranscriptEntry[];
  /** Entries evicted by the size cap, so the replay can say so rather than silently lie. */
  dropped: number;
}

export function getTranscriptRecord(): TranscriptRecord {
  return { entries, dropped };
}

export function clearTranscriptRecord(): void {
  entries.length = 0;
  totalChars = 0;
  dropped = 0;
  openTurn = null;
  openStep = null;
  openTool = null;
}

function grow(entry: TranscriptEntry, chars: number): void {
  entry.size += chars;
  totalChars += chars;
  // Never evict the entry still being written — dropping it would strand
  // `openTurn`/`openStep` pointing at an entry no longer in the list.
  while (totalChars > MAX_RECORD_CHARS && entries.length > 0 && entries[0] !== openTurn) {
    totalChars -= entries[0].size;
    entries.shift();
    dropped++;
  }
}

function ensureStep(): RenderedStep {
  if (!openTurn) {
    openTurn = { kind: 'turn', steps: [], size: 0 };
    entries.push(openTurn);
  }
  if (!openStep) {
    openStep = {};
    openTurn.steps.push(openStep);
  }
  return openStep;
}

/** Record a submitted prompt, exactly as the input UI echoed it. */
export function recordTranscriptPrompt(text: string): void {
  if (!recording) return;
  // A prompt closes any turn left open by an error path that never reached
  // endTranscriptStep, so the next turn's text cannot land under the old one.
  openTurn = null;
  openStep = null;
  openTool = null;
  const entry: TranscriptEntry = { kind: 'prompt', text, size: 0 };
  entries.push(entry);
  grow(entry, text.length);
}

/** Record model text as written to the screen — already markdown-rendered. */
export function recordTranscriptText(rendered: string): void {
  if (!recording || !rendered) return;
  const step = ensureStep();
  step.text = (step.text ?? '') + rendered;
  grow(openTurn!, rendered.length);
}

/** Record a tool call header. The result arrives separately, once the call returns. */
export function recordTranscriptToolCall(
  call: Pick<ToolStep, 'name' | 'displayArgs' | 'rationale' | 'parsedTools'>,
): void {
  if (!recording) return;
  const step = ensureStep();
  openTool = { ...call, result: { kind: 'preformatted', text: '' } };
  (step.tools ??= []).push(openTool);
  grow(openTurn!, call.name.length + JSON.stringify(call.displayArgs).length + (call.rationale?.length ?? 0));
}

/**
 * Attach a result to the tool call currently open. Called twice for a tool whose
 * preview is rendered ahead of confirmation and again after execution; the second
 * call carries the same block, so overwriting is correct either way.
 */
export function recordTranscriptToolResult(result: ToolStepResult): void {
  if (!recording || !openTool) return;
  const previous = openTool.result;
  const previousSize = previous.kind === 'preformatted' ? previous.text.length : 0;
  openTool.result = result;
  const size = result.kind === 'preformatted' ? result.text.length : 0;
  grow(openTurn!, size - previousSize);
}

/** Close the open step; `hasMore: false` also closes the turn. */
export function recordTranscriptStepEnd(hasMore: boolean): void {
  if (!recording) return;
  openStep = null;
  openTool = null;
  if (!hasMore) openTurn = null;
}
