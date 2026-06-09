# src/cli/action-menu.ts - Inline Action Sub-menu

**Role:** Shared inline action sub-menu that splices into any list-picker screen below the selected row. Used by both `scenario-menu.ts` (eval picker) and `commands/model.ts` (model picker).

## Exports

| Symbol | Description |
|--------|-------------|
| `InlineActionMenu` | Class managing action sub-menu state, rendering, and key handling. |
| `ActionMenuResult` | Discriminated union returned by `handleKey`: `close`, `redraw`, or `select`. |

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
