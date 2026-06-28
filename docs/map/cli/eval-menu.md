# src/cli/eval-menu.ts - Unified Eval Menu

**Role:** Orchestrates the unified, tabbed eval menu behind `/eval`. Wraps the lifecycle chrome (`menu-shell.ts`) around a tabbed list menu (`list-menu.ts`) whose tabs are the **Custom** tab (playground/eval scenarios, from `scenario-menu.ts`) and the **HumanEval** tab (from `cli/humaneval-menu.ts`, with dataset loading from `eval/humaneval-data.ts`). After the picker closes it dispatches the tagged choice to the matching run loop.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type EvalTabId = 'custom' | 'humaneval';

runEvalMenu(rl: Interface, _projectRoot: string, getSelectedModel: () => string): Promise<void>
```
<!-- END GENERATED EXPORTS -->

## Behavior

- Builds both tabs every time; opens on the Custom tab. Left/Right on the tab row switches between them.
- **Custom tab data** is always discovered (`discoverPlaygroundScenarios` + history + run/full hashes).
- **HumanEval data is lazy:** loaded from disk only if already present (otherwise the tab shows an empty list).
- Non-TTY prints the eval scenarios list and returns.
- The picker resolves with a tagged `EvalChoice` (`{ kind: 'custom' | 'humaneval', … }`) or null; the body then calls `runEvalScenarios` or `runHumanEvalProblems`.
- When a choice is made, the body does a full screen clear (`\x1b[1;1H\x1b[J`) and redraws the footer before starting the run loop. This ensures the eval header starts at row 1 regardless of how many items were in the list. Sequential evals (run-all) are not cleared between them — only this one-time clear at the menu→run boundary fires.

## Read when

- Changing how `/eval` is composed, adding a new eval tab, or changing the tab data-loading strategy.

## Key neighbors

- `cli/menu-shell.ts` — lifecycle chrome wrapper.
- `cli/list-menu.ts` — tabbed list-menu state machine.
- `cli/scenario-menu.ts` — `buildCustomEvalTab` + `runEvalScenarios` (Custom tab + run loop).
- `cli/humaneval-menu.ts` — `buildHumanEvalTab` + `runHumanEvalProblems` (HumanEval tab + run loop).
- `eval/humaneval-data.ts` — `humanEvalDatasetPath` + `loadHumanEvalProblems` (HumanEval dataset helpers).
- `cli/terminal-ui.ts` — `drawFooter` (redrawn after the full-screen clear at menu→run boundary).
