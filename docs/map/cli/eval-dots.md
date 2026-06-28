# src/cli/eval-dots.ts - Eval Status Circle Renderers

**Role:** Chalk-based renderers for eval status circles. The domain logic (history loading, status computation, hashing, types) has been extracted to `src/eval/history.ts` and `src/eval/custom.ts`. This file keeps only the visual rendering functions.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
statusCircle(status: EvalStatus): string

buildEvalDots(model: string, data: EvalDotsData): string
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `statusCircle(status)` — returns a chalk-colored `●` string for an `EvalStatus`.
- `buildEvalDots(model, data)` — returns a compact string of colored circles, one per scenario in discovery order.

## Key Neighbors

- Imports `getEvalStatus`, `EvalStatus`, `EvalDotsData` from [eval/history.md](../eval/history.md).
- Read by `cli/humaneval-menu.ts` and `commands/model.ts` for circle display.
- `cli/eval-menu.ts` uses `statusCircle` directly for non-TTY list output.

## Update Triggers

- When the `statusCircle` color mapping changes.
- When `buildEvalDots` ordering or format changes.
