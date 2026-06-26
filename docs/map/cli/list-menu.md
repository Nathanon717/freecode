# src/cli/list-menu.ts - Shared Tabbed List Menu

**Role:** The shared tabbed list-menu state machine built on `raw-picker.ts`. Owns the active tab, the selected index (including the `-1` tab-row focus), detail/action modes, Up/Down navigation, the inline-action-menu splice, and the detail-screen swap. Replaces the per-menu copies of this logic in `/eval`, `/config`, and the `/model` picker. Each tab supplies only its body rendering and any extra key behavior.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
VIEWPORT_SIZE: 20

clampViewport(sel: number, viewportStart: number): number

interface ListMenuBody {
  /** The body screen (header + items + footer), with any viewport already applied. */
  lines: string[];
  /** Index within `lines` of the selected row; the action sub-menu splices after it. */
  selectedLineIdx: number;
  /** Index within `lines` to overwrite with `actionHint` while the action menu is open. */
  hintLineIdx?: number;
}

interface ListMenuContext<TResult> {
  /** Index of the active tab. */
  readonly tabIndex: number;
  getSelected(): number;
  setSelected(n: number): void;
  redraw(): void;
  close(result: TResult): void;
  enterDetail(): void;
  openAction(): void;
}

interface MenuTab<TResult> {
  id: string;
  label: string;
  /** Number of selectable items in this tab (post-filter). */
  count: () => number;
  renderBody: (selected: number) => ListMenuBody;
  /** Enables Right-opens-detail when present. */
  renderDetail?: (selected: number) => string[];
  /** Enables Enter-opens-action when present. */
  actionMenu?: {
    menu: InlineActionMenu;
    actionHint: string;
    onSelect: (option: string, ctx: ListMenuContext<TResult>) => void;
  };
  /** Enter handler used when this tab has no `actionMenu`. */
  onEnter?: (ctx: ListMenuContext<TResult>) => void;
  /**
   * Escape hatch for keys the base does not own (favorites, filter typing,
   * value cycling, …). Gets first crack at item-focused keys other than
   * Up/Down/Esc. Return true if the key was handled.
   */
  onKey?: (key: string, ctx: ListMenuContext<TResult>) => boolean;
  /** Controls hint pinned to the last row above the footer. Static string or dynamic callback. */
  controls?: string | (() => string);
  /** When true, tab label renders grey (like inactive tabs) instead of accent-colored. */
  isFiltered?: () => boolean;
}

interface ListMenuOptions<TResult> {
  tabs: MenuTab<TResult>[];
  /** Open on this tab id (else the first tab). */
  initialTabId?: string;
  /** Initial selected item index (default 0 = first item). */
  initialSelected?: number;
  /** Value resolved when the user presses Esc. Default null. */
  onCancel?: () => TResult;
  onExitClear?: (rowCount: number) => void;
  countLines?: (lines: string[]) => number;
}

runListMenu<TResult>(rl: Interface, opts: ListMenuOptions<TResult>): Promise<TResult>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `VIEWPORT_SIZE` / `clampViewport` — shared by tab bodies that scroll a long item list (`scenario-menu.ts` Custom tab, `commands/humaneval.ts` HumanEval tab).

## Behavior

- **Tab-row focus model** (matches `/config`): with more than one tab, Up from item 0 focuses the tab row (`selected === -1`); Left/Right there switch tabs; Down returns to item 0. Any other key on the tab row falls through to `tab.onKey` (e.g. `/config`'s `q` to quit). With a single tab, no tab bar or tab chrome is drawn and the tab row is unreachable.
- **Pinned tab chrome:** tabbed menus render a blank line above the tab row and ask `raw-picker` to pin the menu to viewport row 1. Single-tab menus keep their body-only render path (no tab bar).
- **Windowed tab bar** (`renderTabBar`): the bar is clamped to the terminal width, windowed around the active tab so it's always visible; a dim `‹` / `›` marks tabs clipped off either side. Tab bodies that size themselves to the terminal height should reserve the bar's rows (3: blank + bar + blank) — e.g. `/model` passes `reserveRows` into its `buildScreen`.
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
