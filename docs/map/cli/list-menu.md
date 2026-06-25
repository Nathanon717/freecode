# src/cli/list-menu.ts - Shared Tabbed List Menu

**Role:** The shared tabbed list-menu state machine built on `raw-picker.ts`. Owns the active tab, the selected index (including the `-1` tab-row focus), detail/action modes, Up/Down navigation, the inline-action-menu splice, and the detail-screen swap. Replaces the per-menu copies of this logic in `/eval`, `/config`, and the `/model` picker. Each tab supplies only its body rendering and any extra key behavior.

## Exports

```typescript
interface ListMenuBody { lines: string[]; selectedLineIdx: number; hintLineIdx?: number; }
interface ListMenuContext<TResult> {
  readonly tabIndex: number;
  getSelected(): number; setSelected(n: number): void;
  redraw(): void; close(result: TResult): void;
  enterDetail(): void; openAction(): void;
}
interface MenuTab<TResult> {
  id: string; label: string;
  count: () => number;
  renderBody: (selected: number) => ListMenuBody;
  renderDetail?: (selected: number) => string[];           // enables Right-opens-detail
  actionMenu?: { menu: InlineActionMenu; actionHint: string; onSelect: (option, ctx) => void };  // enables Enter-opens-action
  onEnter?: (ctx) => void;                                  // Enter when no actionMenu
  onKey?: (key: string, ctx) => boolean;                   // escape hatch; true if handled
  controls?: string | (() => string);                      // hint pinned to last row above footer; hidden in detail mode
}
interface ListMenuOptions<TResult> {
  tabs: MenuTab<TResult>[];
  title?: string;                                           // grey pinned tab chrome label, e.g. "config"
  initialTabId?: string; initialSelected?: number;
  wrap?: boolean;                                           // default true; config sets false
  onCancel?: () => TResult; onExitClear?; countLines?;
}
runListMenu<TResult>(rl: Interface, opts: ListMenuOptions<TResult>): Promise<TResult>

const VIEWPORT_SIZE: number                                // rows kept on screen in a scrolling tab body
clampViewport(sel: number, viewportStart: number): number  // smallest shift keeping sel in view
```

Shared by tab bodies that scroll a long item list (`scenario-menu.ts` Custom tab, `commands/humaneval.ts` HumanEval tab).

## Behavior

- **Tab-row focus model** (matches `/config`): with more than one tab, Up from item 0 focuses the tab row (`selected === -1`); Left/Right there switch tabs; Down returns to item 0. Any other key on the tab row falls through to `tab.onKey` (e.g. `/config`'s `q` to quit). With a single tab, no tab bar or tab chrome is drawn and the tab row is unreachable.
- **Pinned tab chrome:** tabbed menus render a blank line above the tab row and ask `raw-picker` to pin the menu to viewport row 1. Single-tab menus such as `/model` keep their existing body-only render path.
- **Navigation:** Up/Down move the selection; `wrap` controls end-wrapping.
- **Detail:** Right opens `renderDetail` (when present); Esc/Left returns.
- **Action:** Enter opens `actionMenu` (when present), splicing `menu.renderLines()` after `selectedLineIdx` and overwriting `hintLineIdx` with `actionHint`; delegates keys to `InlineActionMenu`. With no `actionMenu`, Enter calls `onEnter`.
- **Escape hatch:** item-focused keys other than Up/Down/Esc are offered to `tab.onKey` first (favorites, filter typing, value cycling), then the Right/Enter fallbacks.
- Funnels through a single `runRawPicker` call so the captured-opts command tests keep working.

## Read when

- Adding or changing a tabbed/list menu, or the shared navigation/detail/action behavior.

## Key neighbors

- `cli/raw-picker.ts` — the underlying raw-mode picker.
- `cli/action-menu.ts` — `InlineActionMenu` used for the action sub-menu.
- `cli/menu-shell.ts` — the lifecycle chrome menus wrap around this.
- `cli/scenario-menu.ts`, `commands/humaneval.ts`, `commands/config.ts`, `commands/model.ts` — adopters.
