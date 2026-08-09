# src/cli/eval/eval-menu.ts - Unified Eval Menu

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Orchestrates the unified, tabbed eval menu behind `/eval`. Wraps the lifecycle chrome (`menu-shell.ts`) around a tabbed list menu (`list-menu.ts`) whose tabs are the **Custom** tab (evals/custom scenarios, from `custom-eval-menu.ts`) and the **HumanEval** tab (from `cli/eval/humaneval-menu.ts`, with dataset loading from `eval/humaneval-data.ts`). After the picker closes it dispatches the tagged choice to the matching run loop.

## Read When

- Changing how `/eval` is composed, adding a new eval tab, or changing the tab data-loading strategy.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
runEvalMenu(rl: Interface, _projectRoot: string, getSelectedModel: () => string): Promise<void>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`eval/custom.ts`](../../eval/custom.md) ×6, [`eval/humaneval-data.ts`](../../eval/humaneval-data.md) ×5, [`cli/eval/custom-eval-menu.ts`](custom-eval-menu.md) ×4, [`eval/history.ts`](../../eval/history.md) ×3, [`cli/eval/humaneval-menu.ts`](humaneval-menu.md) ×2, [`cli/menus/list-menu.ts`](../menus/list-menu.md) ×2, [`cli/chrome/bottom-ui.ts`](../chrome/bottom-ui.md) ×1, [`cli/eval/eval-dots.ts`](eval-dots.md) ×1, [`cli/menus/menu-shell.ts`](../menus/menu-shell.md) ×1, [`cli/menus/raw-picker.ts`](../menus/raw-picker.md) ×1, [`cli/render/banner.ts`](../render/banner.md) ×1, [`providers/model-data.ts`](../../providers/model-data.md) ×1, +1 more
- **Imported by:** [`cli/session-modes.ts`](../session-modes.md) ×2

## Tests

`tests/cli/eval/eval-menu.test.ts`. 1 other test file references it.

## Budget

122 / 500 lines (378 to spare).
<!-- END GENERATED MAP FACTS -->

## Behavior

- Builds both tabs every time; opens on the Custom tab. Left/Right on the tab row switches between them.
- **Custom tab data** is always discovered (`discoverCustomEvals` + history + run/full hashes).
- **HumanEval data is lazy:** loaded from disk only if already present (otherwise the tab shows an empty list).
- Non-TTY prints the eval scenarios list and returns.
- The picker resolves with a tagged `EvalChoice` (`{ kind: 'custom' | 'humaneval', … }`) or null; the body then calls `runEvalScenarios` or `runHumanEvalProblems`.
- When a choice is made, the body does a full screen clear (`\x1b[1;1H\x1b[J`) and redraws the footer before starting the run loop. This ensures the eval header starts at row 1 regardless of how many items were in the list. Sequential evals (run-all) are not cleared between them — only this one-time clear at the menu→run boundary fires.

## Key neighbors

- `cli/menus/menu-shell.ts` — lifecycle chrome wrapper.
- `cli/menus/list-menu.ts` — tabbed list-menu state machine.
- `cli/eval/custom-eval-menu.ts` — `buildCustomEvalTab` + `runEvalScenarios` (Custom tab + run loop).
- `cli/eval/humaneval-menu.ts` — `buildHumanEvalTab` + `runHumanEvalProblems` (HumanEval tab + run loop).
- `eval/humaneval-data.ts` — `humanEvalDatasetPath` + `loadHumanEvalProblems` (HumanEval dataset helpers).
- `cli/chrome/bottom-ui.ts` — `drawFooter` (redrawn after the full-screen clear at menu→run boundary).
