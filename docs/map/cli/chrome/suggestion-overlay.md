# src/cli/chrome/suggestion-overlay.ts - Suggestion Overlay Snapshot

**Role:** The snapshot/restore half of the slash-command suggestion rows. Owns the captured screen lines and the escape sequence that repaints them; `bottom-ui.ts` owns where the rows sit and when they open.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
getOverlayRows(): number

resetOverlay(): void

captureOverlay(n: number, startRow: number, scrollHeight: number): void

composeOverlayRestore(width: number): string
```
<!-- END GENERATED EXPORTS -->

## Why a snapshot exists

Suggestion rows draw **over** the scroll region rather than inside the reserved bottom rows, so they overpaint live transcript. The covered rows are read out of the screen buffer when the overlay opens (`captureOverlay`) and repainted from that copy when it closes (`composeOverlayRestore`), which is why closing the overlay doesn't leave holes in the transcript.

## Export notes

- `composeOverlayRestore` — returns `''` when no overlay is open, so callers concatenate it unconditionally. It **clears the snapshot as a side effect**; there is no separate close call.
- `resetOverlay` — drops the snapshot *without* repainting. Only for resize, where every absolute row position the snapshot recorded is already stale.

## Read when

Debugging transcript rows left blank or duplicated after a `/` menu closes, or changing where suggestion rows draw.

## Key neighbors

- `cli/chrome/bottom-ui.ts` — sole caller; splitting this out is what kept it under the 500-line limit
- `util/screen-buffer.ts` — `getScreenBufferDisplayLinesForOverlay` supplies the snapshot lines
