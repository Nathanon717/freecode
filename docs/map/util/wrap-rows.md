# src/util/wrap-rows.ts - Wrapped-Row Math

**Role:** Counts the terminal rows soft-wrapped text actually occupies, for callers that must fit a block into a known number of rows.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
terminalColumns(): number

visualRows(line: string, cols: number): number

fitLinesToRows<T>(lines: T[], maxRows: number, render: (line: T) => string): T[]
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `visualRows` / `fitLinesToRows` — exist because logical lines are not rows: one long line wraps to several. Any budget expressed in logical lines silently overflows on long content, which is the whole bug these prevent.
- `fitLinesToRows(lines, maxRows, render)` — generic over the line element (`T`), so callers can fit either plain strings (the read/create/text preview) or richer entry objects (the edit diff's `{ text, type, num }` rows) as long as `render` maps one to the text actually written (indent, colour). The wrap math then measures what lands on screen. Reserves one row for the caller's own "… (N more lines)" note, and always keeps at least one line so a single over-long line still shows its head.

## Read when

- Changing how a transcript block is trimmed to fit the screen.

## Key neighbors

- [../cli/transcript-renderer.md](../cli/render/transcript-renderer.md) — sole consumer; trims the pending-approval preview with these.
- [../cli/tool-approval.md](../cli/tools/tool-approval.md) — owns the row budget that gets passed in.
- [screen-buffer.md](screen-buffer.md) — provides `stripAnsi` for the width measurement.

## Update triggers

Update when the wrap model changes (e.g. wide/CJK character width, which the current `stripAnsi().length` measure does not model).
