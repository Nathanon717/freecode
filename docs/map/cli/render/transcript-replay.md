# src/cli/render/transcript-replay.ts - Post-Wipe Transcript Replay

**Role:** Reprints the conversation after a full-screen wipe, so the screen never
claims less history than the model is actually being sent.

**Read when:** changing what a menu leaves on screen, or what a replayed turn
shows.

## Why not repaint from the screen buffer

The obvious approach — repaint from `util/screen-buffer.ts`, as the resize
handler in `cli/chrome/bottom-ui.ts` does — does not work here. The raw pickers'
own cleanup writes `\x1b[${rows}A\r\x1b[J` (`cli/menus/raw-picker.ts`), and
`hasFullScreenErase` treats `\x1b[J` as a wipe, so the buffer is already empty by
the time a menu exits.

## What it prints

The conversation as it was, not a summary of it. Entries come from
[transcript-record.md](transcript-record.md) and go back through the same
`renderTurn` that drew them live, so divider spacing, rendered markdown, tool
call lines, result previews and edit diffs all return unchanged. The unit test
asserts this directly: live paint and replayed body must be byte-identical.

Two things the live paint did not have: a header stating the true
`Conversation.messages` count (the record is what was *on screen*; the history is
what is *sent*, and the header states the latter), and a `… N earlier entries not
shown` line when the record's size cap evicted anything.

No-op on an empty record, which is what keeps `/clear` landing on a bare banner —
`/clear` empties the record alongside the history.

## State machine handling

Replay drives the module-global turn/step state in `transcript-renderer.ts`, so
it brackets itself with `resetTranscriptTurnState()`: a clean slate first, so the
first replayed turn does not open with the divider the last live turn deferred,
then `resetTranscriptTurnState(true)` after, leaving the machine as a completed
turn would. Recording is suspended throughout, or the replay would append itself
to the record it is reading.

## Key neighbors

[../command-dispatcher.md](../command-dispatcher.md) is the only caller (after
`/config`, `/model`, `/eval`). [transcript-renderer.md](transcript-renderer.md)
supplies `renderTurn` and `formatPromptEcho`, the latter shared with
`cli/session-modes.ts` so a replayed prompt echo cannot drift from the live one.

## Update triggers

A new command that wipes the screen without clearing history, or a change to what
`transcript-record.ts` stores.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
replayTranscript(messages: CoreMessage[], options?: TranscriptRuntimeOptions): void
```
<!-- END GENERATED EXPORTS -->
