# src/cli/render/transcript-record.ts - Rendered Transcript Record

**Role:** Append-only, size-capped record of what the transcript renderer
actually put on screen, so a post-wipe replay can reprint the conversation
instead of reconstructing an approximation of it.

**Read when:** changing what a replay shows, adding a write site that puts
conversation content on screen, or chasing a replay that renders something the
live paint did not.

## Why record rather than re-derive

`Conversation.messages` stores a tool's result *string*, not the
`oldText`/`newText` that `formatEditFileDiff` renders from — so a replay driven
by history alone can never reproduce an edit diff. Recording what was rendered
makes the replay identical to the live paint by construction:
[transcript-replay.md](transcript-replay.md) re-runs the same `renderTurn` over
the same inputs.

## What the entries hold

Tool **headers** stay structured (`name`, `displayArgs`, `rationale`,
`parsedTools`), so a replayed call line still comes from `formatToolCallLine`.
Tool **result bodies** are stored already-rendered as `ToolStepResult`'s
`preformatted` kind. That keeps an entry bounded — the on-screen preview is
capped at `maxResultLines` while the raw result behind it can be megabytes — and
keeps the replayed block byte-identical, truncation footer included.

Not recorded: menu chrome, approval prompts, retry countdowns and the rest of the
ephemeral UI, which rewrite themselves with cursor motion and would scribble if
replayed. The record holds the conversation only.

`MAX_RECORD_CHARS` evicts the oldest entries and counts them in `dropped`; the
entry still being written is never evicted, since `openTurn`/`openStep` point
into it.

## Key neighbors

[transcript-renderer.md](transcript-renderer.md) does the recording — the hooks
sit inside `writeToolCallHeader`, `writeToolResultPreview`, `writeToolStepResult`,
`writeTranscriptText` and `endTranscriptStep`, so a caller that renders normally
records automatically. Prompts come from `cli/session-modes.ts` — which gates the
call on `isSlashCommand` ([../slash-commands.md](../slash-commands.md)), since a
slash command is UI and never reaches the model — the fake
provider records its own chunks (`providers/fake.ts`), and
[../command-dispatcher.md](../command-dispatcher.md) clears the record alongside
the history on `/clear`.

## Update triggers

A new kind of conversation content on screen, a change to `RenderedStep` /
`ToolStep`, or a new command that wipes the screen.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * One replayable unit: a submitted prompt, or a whole agent turn.
 */
type TranscriptEntry =
  | { kind: 'prompt'; text: string; size: number }
  | { kind: 'turn'; steps: RenderedStep[]; size: number };

setTranscriptRecording(on: boolean): void

interface TranscriptRecord {
  entries: readonly TranscriptEntry[];
  /** Entries evicted by the size cap, so the replay can say so rather than silently lie. */
  dropped: number;
}

getTranscriptRecord(): TranscriptRecord

clearTranscriptRecord(): void

/**
 * Record a submitted prompt, exactly as the input UI echoed it.
 */
recordTranscriptPrompt(text: string): void

/**
 * Record model text as written to the screen — already markdown-rendered.
 */
recordTranscriptText(rendered: string): void

/**
 * Record a tool call header. The result arrives separately, once the call returns.
 */
recordTranscriptToolCall(call: Pick<ToolStep, "name" | "displayArgs" | "rationale" | "parsedTools">): void

/**
 * Attach a result to the tool call currently open. Called twice for a tool whose
 * preview is rendered ahead of confirmation and again after execution; the second
 * call carries the same block, so overwriting is correct either way.
 */
recordTranscriptToolResult(result: ToolStepResult): void

/**
 * Close the open step; `hasMore: false` also closes the turn.
 */
recordTranscriptStepEnd(hasMore: boolean): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/render/transcript-renderer.ts`](transcript-renderer.md) ×7
- **Imported by:** [`cli/render/transcript-renderer.ts`](transcript-renderer.md) ×5, [`cli/render/transcript-replay.ts`](transcript-replay.md) ×3, [`providers/fake.ts`](../../providers/fake.md) ×2, [`cli/command-dispatcher.ts`](../command-dispatcher.md) ×1, [`cli/session-modes.ts`](../session-modes.md) ×1

## Tests

`tests/cli/render/transcript-record.test.ts`. 3 other test files reference it.

## Budget

150 / 500 lines (350 to spare).
<!-- END GENERATED MAP FACTS -->
