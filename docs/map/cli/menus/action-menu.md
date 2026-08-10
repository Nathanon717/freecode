# src/cli/menus/action-menu.ts - Inline Action Sub-menu

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Shared inline action sub-menu that splices into any list-picker screen below the selected row. Used by both `custom-eval-menu.ts` (eval picker) and `commands/model.ts` (model picker).
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type ActionMenuResult =
  | { type: 'close' }
  | { type: 'redraw' }
  | { type: 'select'; option: string };

/**
 * Renders and handles keyboard input for an inline action sub-menu that splices
 * into a list picker screen directly below the selected row.
 */
class InlineActionMenu {
  sel;
  readonly padWidth: number;
  constructor(options: readonly string[]): InlineActionMenu;
  renderLines(): string[];
  handleKey(key: string): ActionMenuResult;
  reset(): void;
}
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/render/banner.ts`](../render/banner.md) ×1
- **Imported by:** [`commands/model.ts`](../../commands/model.md) ×4, [`cli/eval/custom-eval-menu.ts`](../eval/custom-eval-menu.md) ×1, [`cli/eval/humaneval-menu.ts`](../eval/humaneval-menu.md) ×1, [`cli/menus/list-menu.ts`](list-menu.md) ×1

## Tests

`tests/cli/menus/action-menu.test.ts`. 1 other test file references it.

## Budget

52 / 500 lines (448 to spare).
<!-- END GENERATED MAP FACTS -->

## Usage

```typescript
const menu = new InlineActionMenu(['Run', 'View', 'Edit']);
// In render, splice after the selected screen row:
lines.splice(selectedScreenIdx + 1, 0, ...menu.renderLines());
// In onKey (action mode only):
const res = menu.handleKey(key);
if (res.type === 'select') { /* res.option */ }
```
