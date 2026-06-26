# src/cli/action-menu.ts - Inline Action Sub-menu

**Role:** Shared inline action sub-menu that splices into any list-picker screen below the selected row. Used by both `scenario-menu.ts` (eval picker) and `commands/model.ts` (model picker).

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type ActionMenuResult =
  | { type: 'close' }
  | { type: 'redraw' }
  | { type: 'select'; option: string };

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

## Export notes

- `InlineActionMenu` manages action sub-menu state, rendering, and key handling; spliced inline below the selected row in any list-picker screen.

## Usage

```typescript
const menu = new InlineActionMenu(['Run', 'View', 'Edit']);
// In render, splice after the selected screen row:
lines.splice(selectedScreenIdx + 1, 0, ...menu.renderLines());
// In onKey (action mode only):
const res = menu.handleKey(key);
if (res.type === 'select') { /* res.option */ }
```

## Key Neighbours

- `cli/raw-picker.ts` — `runRawPicker` host that callers use
- `cli/scenario-menu.ts` — eval picker consumer
- `commands/model.ts` — model picker consumer

## Update Triggers

Update when action sub-menu visual style, key bindings, or result type changes.
