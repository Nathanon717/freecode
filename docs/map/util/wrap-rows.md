# src/util/wrap-rows.ts - Wrapped-Row Math

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Counts the terminal rows soft-wrapped text actually occupies, for callers that must fit a block into a known number of rows.

## Read When

- Changing how a transcript block is trimmed to fit the screen.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Current terminal width. Both transcript streams share one terminal.
 */
terminalColumns(): number

/**
 * Rows one written line occupies once the terminal wraps it. Logical lines are not
 * rows — one long line wraps to several — so any budget expressed in logical lines
 * silently overflows on long content. That is the bug this and `fitLinesToRows`
 * exist to prevent.
 */
visualRows(line: string, cols: number): number

/**
 * Take the leading lines of `lines` that fit `maxRows` wrapped terminal rows,
 * keeping one row in hand for a caller's "... (N more lines)" note. `render`
 * maps a line to the text actually written (indent, colouring), so the wrap
 * math measures what lands on screen. Always keeps at least one line, so a
 * single over-long line still shows its head.
 */
fitLinesToRows<T>(lines: T[], maxRows: number, render: (line: T) => string): T[]
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`util/screen-buffer.ts`](screen-buffer.md) ×1
- **Imported by:** [`cli/render/transcript-renderer.ts`](../cli/render/transcript-renderer.md) ×4, [`cli/render/transcript-format.ts`](../cli/render/transcript-format.md) ×2

## Tests

`tests/util/wrap-rows.test.ts`.

## Budget

53 / 500 lines (447 to spare).

## Env

`COLUMNS`
<!-- END GENERATED MAP FACTS -->

## Key neighbors

- [../cli/transcript-renderer.md](../cli/render/transcript-renderer.md) — sole consumer; trims the pending-approval preview with these.
- [../cli/tool-approval.md](../cli/tools/tool-approval.md) — owns the row budget that gets passed in.
- [screen-buffer.md](screen-buffer.md) — provides `stripAnsi` for the width measurement.

## Update triggers

Update when the wrap model changes (e.g. wide/CJK character width, which the current `stripAnsi().length` measure does not model).
