# src/cli/eval/eval-dots.ts - Eval Status Circle Renderers

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Chalk-based renderers for eval status circles. The domain logic (history loading, status computation, hashing, types) has been extracted to `src/eval/history.ts` and `src/eval/custom.ts`. This file keeps only the visual rendering functions.

## Read When

- Changing circle colors per eval status, like swapping orange for the theme warning.
- Adding a new eval status that needs a matching circle in the statusCircle switch.
- Debugging a wrong circle shown for a scenario, since status logic lives in src/eval/history.ts.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * A chalk-coloured `●` for one `EvalStatus`.
 */
statusCircle(status: EvalStatus): string

/**
 * A compact string of coloured circles, one per scenario in discovery order.
 */
buildEvalDots(model: string, data: EvalDotsData): string
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`eval/history.ts`](../../eval/history.md) ×3, [`cli/theme.ts`](../theme.md) ×1
- **Imported by:** [`cli/eval/eval-menu.ts`](eval-menu.md) ×1, [`cli/eval/eval-screen.ts`](eval-screen.md) ×1, [`cli/eval/humaneval-menu.ts`](humaneval-menu.md) ×1, [`commands/model.ts`](../../commands/model.md) ×1

## Tests

`tests/cli/eval/eval-dots.test.ts`. 2 other test files reference it.

## Budget

30 / 500 lines (470 to spare).
<!-- END GENERATED MAP FACTS -->
