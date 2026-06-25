# src/util/line-diff.ts - LCS Line Diff

**Role:** Pure LCS-based line diff algorithm with no rendering dependencies. Returns a structured diff array for consumption by renderers.

## Exports

| Symbol | Description |
|--------|-------------|
| `DiffEntry` | `{ type: 'equal' \| 'remove' \| 'add'; text: string }` — one line in a diff result. |
| `computeLineDiff(oldLines, newLines)` | Computes LCS diff between two string arrays; returns `DiffEntry[]`. |

## Key Facts

- No chalk or rendering logic — pure algorithm.
- Used by `cli/transcript-renderer.ts` (`formatEditFileDiff`) to render colored file diffs.
- `DiffEntry` is re-exported from `cli/transcript-renderer.ts` for backward compatibility.

## Read When

- Changing the diff algorithm or its output shape.
- Adding a new consumer of structured line diffs.
