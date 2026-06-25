# src/cli/eval-dots.ts - Eval Status Circle Renderers

**Role:** Chalk-based renderers for eval status circles. The domain logic (history loading, status computation, hashing, types) has been extracted to `src/eval/history.ts` and `src/eval/playground.ts`. This file keeps only the visual rendering functions.

## Exports

| Symbol | Description |
|--------|-------------|
| `statusCircle(status)` | Returns a chalk-colored `●` string for an `EvalStatus`. |
| `buildEvalDots(model, data)` | Returns a compact string of colored circles, one per scenario in discovery order. |

## Key Neighbors

- Imports `getEvalStatus`, `EvalStatus`, `EvalDotsData` from [eval/history.md](../eval/history.md).
- Read by `commands/humaneval.ts` and `commands/model.ts` for circle display.
- `cli/eval-menu.ts` uses `statusCircle` directly for non-TTY list output.

## Update Triggers

- When the `statusCircle` color mapping changes.
- When `buildEvalDots` ordering or format changes.
