# src/cli/chrome/suggestion-overlay.ts - Suggestion Overlay Snapshot

<!-- BEGIN GENERATED MAP INTENT -->
## Role

The snapshot/restore half of the slash-command suggestion rows. Owns the captured screen lines and the escape sequence that repaints them; `bottom-ui.ts` owns where the rows sit and when they open.

## Read When

Debugging transcript rows left blank or duplicated after a `/` menu closes, or changing where suggestion rows draw.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
getOverlayRows(): number

/**
 * Drop the snapshot without repainting — for when every absolute row moved (resize).
 */
resetOverlay(): void

/**
 * Snapshot the `n` scroll-region rows the overlay is about to cover.
 */
captureOverlay(n: number, startRow: number, scrollHeight: number): void

/**
 * Escape sequence that repaints the covered rows from the snapshot, and clears
 * it — there is no separate close call. Returns '' when no overlay is open, so
 * callers can concatenate blindly.
 */
composeOverlayRestore(width: number): string
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/chrome/ansi.ts`](ansi.md) ×2, [`util/screen-buffer.ts`](../../util/screen-buffer.md) ×2
- **Imported by:** [`cli/chrome/bottom-ui.ts`](bottom-ui.md) ×8

## Tests

`tests/cli/chrome/suggestion-overlay.test.ts`.

## Budget

58 / 500 lines (442 to spare).
<!-- END GENERATED MAP FACTS -->

## Why a snapshot exists

Suggestion rows draw **over** the scroll region rather than inside the reserved bottom rows, so they overpaint live transcript. The covered rows are read out of the screen buffer when the overlay opens (`captureOverlay`) and repainted from that copy when it closes (`composeOverlayRestore`), which is why closing the overlay doesn't leave holes in the transcript.
