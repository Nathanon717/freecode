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
the time a menu exits. Rendering from `Conversation.messages` instead makes
screen-matches-history true by construction rather than by bookkeeping.

## What it prints

A summary, not a re-run of the original stream: user turns, assistant text, and
one line per tool call via `formatToolCallLine`. **Tool result bodies are
deliberately omitted** — since tool results began persisting (see
[../../agent/turn-messages.md](../../agent/turn-messages.md)) they are the bulk
of a turn, and replaying them would bury the conversation they belong to. History
longer than `MAX_REPLAYED_MESSAGES` is tail-shown under a `… N earlier messages`
line; the header always states the true total.

No-op on empty history, which is what keeps `/clear` landing on a bare banner.

## Key neighbors

[../command-dispatcher.md](../command-dispatcher.md) is the only caller (after
`/config`, `/model`, `/eval`). `transcript-renderer.ts` supplies the tool-call
formatting so a replayed call line matches the live one.

## Update triggers

A new command that wipes the screen without clearing history, or a change to the
message shapes stored in `Conversation`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
replayTranscript(messages: CoreMessage[], write?: (s: string) => void): void
```
<!-- END GENERATED EXPORTS -->
