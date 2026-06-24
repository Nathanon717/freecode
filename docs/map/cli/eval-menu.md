# src/cli/eval-menu.ts - Unified Eval Menu

**Role:** Orchestrates the unified, tabbed eval menu behind `/eval` and `/humaneval`. Wraps the lifecycle chrome (`menu-shell.ts`) around a tabbed list menu (`list-menu.ts`) whose tabs are the **Custom** tab (playground/eval scenarios, from `scenario-menu.ts`) and the **HumanEval** tab (from `commands/humaneval.ts`). After the picker closes it dispatches the tagged choice to the matching run loop.

## Exports

| Symbol | Description |
|--------|-------------|
| `runEvalMenu(rl, projectRoot, getSelectedModel)` | `/eval` entry; opens on the Custom tab. |
| `runHumanEvalMenu(rl, projectRoot, getSelectedModel, downloadFn?)` | `/humaneval` entry; opens on the HumanEval tab and downloads the dataset first if missing. `downloadFn` is a test seam. |
| `type EvalTabId` | `'custom' \| 'humaneval'`. |

## Behavior

- Builds both tabs every time; the active tab is `initialTab` (`custom` for `/eval`, `humaneval` for `/humaneval`). Left/Right on the tab row switches between them.
- **Custom tab data** is always discovered (`discoverPlaygroundScenarios` + history + run/full hashes).
- **HumanEval data is lazy:** downloaded only when entering via the HumanEval tab; from `/eval` it loads from disk only if already present (otherwise the tab shows an empty list).
- Non-TTY prints the active tab's list (eval scenarios or HumanEval problems) and returns.
- The picker resolves with a tagged `EvalChoice` (`{ kind: 'custom' | 'humaneval', … }`) or null; the body then calls `runEvalScenarios` or `runHumanEvalProblems`.

## Read when

- Changing how `/eval` / `/humaneval` are composed, adding a new eval tab, or changing the tab data-loading strategy.

## Key neighbors

- `cli/menu-shell.ts` — lifecycle chrome wrapper.
- `cli/list-menu.ts` — tabbed list-menu state machine.
- `cli/scenario-menu.ts` — `buildCustomEvalTab` + `runEvalScenarios` (Custom tab + run loop).
- `commands/humaneval.ts` — `buildHumanEvalTab` + `runHumanEvalProblems` + dataset helpers (HumanEval tab + run loop).
