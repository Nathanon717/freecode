# src/util/wrap-rows.ts - Wrapped-Row Math

**Role:** Counts the terminal rows soft-wrapped text actually occupies, for callers that must fit a block into a known number of rows.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
terminalColumns(): number

visualRows(line: string, cols: number): number

fitLinesToRows(lines: string[], maxRows: number, render: (line: string) => string): string[]
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `visualRows` / `fitLinesToRows` — exist because logical lines are not rows: one long line wraps to several. Any budget expressed in logical lines silently overflows on long content, which is the whole bug these prevent.
- `fitLinesToRows(lines, maxRows, render)` — `render` maps a line to the text actually written (indent, colour) so the wrap math measures what lands on screen. Reserves one row for the caller's own "… (N more lines)" note, and always keeps at least one line so a single over-long line still shows its head.

## Read when

- Changing how a transcript block is trimmed to fit the screen.

## Key neighbors

- [../cli/transcript-renderer.md](../cli/transcript-renderer.md) — sole consumer; trims the pending-approval preview with these.
- [../cli/tool-approval.md](../cli/tool-approval.md) — owns the row budget that gets passed in.
- [screen-buffer.md](screen-buffer.md) — provides `stripAnsi` for the width measurement.

## Update triggers

Update when the wrap model changes (e.g. wide/CJK character width, which the current `stripAnsi().length` measure does not model).
