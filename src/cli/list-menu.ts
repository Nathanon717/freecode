import type { Interface } from "readline";
import chalk from "chalk";
import { runRawPicker } from "./raw-picker.js";
import type { InlineActionMenu } from "./action-menu.js";
import { getBannerColor, getBannerColorRGB } from "./banner.js";

// Key sequences shared by every raw-mode menu.
const ESC = "\x1b";
const UP = "\x1b[A";
const DOWN = "\x1b[B";
const RIGHT = "\x1b[C";
const LEFT = "\x1b[D";
const ENTER_CR = "\r";
const ENTER_LF = "\n";

/** Rows kept on screen at once in a scrolling list-menu tab body. */
export const VIEWPORT_SIZE = 20;

/** Smallest viewport shift that keeps `sel` in view (no-op when already visible). */
export function clampViewport(sel: number, viewportStart: number): number {
  if (sel < viewportStart) return sel;
  if (sel >= viewportStart + VIEWPORT_SIZE) return sel - VIEWPORT_SIZE + 1;
  return viewportStart;
}

/** What a tab's `renderBody` returns: the body screen plus the indices the base
 *  needs to splice the inline action menu and swap the hint line. */
export interface ListMenuBody {
  /** The body screen (header + items + footer), with any viewport already applied. */
  lines: string[];
  /** Index within `lines` of the selected row; the action sub-menu splices after it. */
  selectedLineIdx: number;
  /** Index within `lines` to overwrite with `actionHint` while the action menu is open. */
  hintLineIdx?: number;
}

/** Handed to per-tab callbacks so they can drive the base's owned state. */
export interface ListMenuContext<TResult> {
  /** Index of the active tab. */
  readonly tabIndex: number;
  getSelected(): number;
  setSelected(n: number): void;
  redraw(): void;
  close(result: TResult): void;
  enterDetail(): void;
  openAction(): void;
}

export interface MenuTab<TResult> {
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

export interface ListMenuOptions<TResult> {
  tabs: MenuTab<TResult>[];
  /** Open on this tab id (else the first tab). */
  initialTabId?: string;
  /** Initial selected item index (default 0 = first item). */
  initialSelected?: number;
  /** Wrap Up/Down at the list ends. Default true; set false for non-wrapping menus. */
  wrap?: boolean;
  /** Value resolved when the user presses Esc. Default null. */
  onCancel?: () => TResult;
  onExitClear?: (rowCount: number) => void;
  countLines?: (lines: string[]) => number;
}

/** Plain (un-styled) width of a tab cell: the label plus its one-space padding each side. */
function tabCellWidth(label: string): number {
  return label.length + 2;
}

/**
 * Renders the tab bar, windowed around the active tab so it never runs past the
 * terminal width. When tabs are clipped on a side, a dim `‹` / `›` marks that
 * more tabs exist off-screen. `styleTab(i)` returns the styled cell for tab `i`.
 */
function renderTabBar(
  tabs: { label: string }[],
  tabIndex: number,
  styleTab: (i: number) => string,
): string {
  const SEP = "   ";
  const cols = process.stdout.columns ?? 80;
  // Reserve the leading indent plus room for both overflow arrows.
  const budget = Math.max(8, cols - 2 - 4);

  // Greedily grow a window outward from the active tab while it still fits.
  let lo = tabIndex;
  let hi = tabIndex;
  let used = tabCellWidth(tabs[tabIndex].label);
  for (;;) {
    let grew = false;
    if (hi + 1 < tabs.length && used + SEP.length + tabCellWidth(tabs[hi + 1].label) <= budget) {
      used += SEP.length + tabCellWidth(tabs[hi + 1].label);
      hi++;
      grew = true;
    }
    if (lo - 1 >= 0 && used + SEP.length + tabCellWidth(tabs[lo - 1].label) <= budget) {
      used += SEP.length + tabCellWidth(tabs[lo - 1].label);
      lo--;
      grew = true;
    }
    if (!grew) break;
  }

  const parts: string[] = [];
  for (let i = lo; i <= hi; i++) parts.push(styleTab(i));
  const left = lo > 0 ? chalk.dim("‹ ") : "";
  const right = hi < tabs.length - 1 ? chalk.dim(" ›") : "";
  return `  ${left}${parts.join(chalk.dim(SEP))}${right}`;
}

/**
 * Shared tabbed list menu, built on `runRawPicker`. Owns the active tab, the
 * selected index (incl. the `-1` tab-row focus when there is more than one tab),
 * detail/action modes, Up/Down navigation, the inline-action-menu splice, and
 * the detail-screen swap. Each tab supplies its own body rendering and any
 * extra key behavior.
 *
 * Tab-row focus model (matches `/config`): with multiple tabs, Up from item 0
 * focuses the tab row (`selected === -1`); Left/Right there switch tabs; Down
 * returns to item 0.
 */
export function runListMenu<TResult>(
  rl: Interface,
  opts: ListMenuOptions<TResult>,
): Promise<TResult> {
  const { tabs } = opts;
  const wrap = opts.wrap ?? true;
  const hasTabs = tabs.length > 1;
  const cancelValue = (): TResult =>
    opts.onCancel ? opts.onCancel() : (null as TResult);

  let tabIndex = Math.max(
    0,
    opts.initialTabId ? tabs.findIndex((t) => t.id === opts.initialTabId) : 0,
  );
  if (tabIndex < 0) tabIndex = 0;
  let selected = opts.initialSelected ?? 0;
  let detailMode = false;
  let actionMode = false;

  return runRawPicker<TResult>(rl, {
    countLines: opts.countLines,
    onExitClear: opts.onExitClear,
    pinToTop: hasTabs,
    getControls: () => {
      if (detailMode) return undefined;
      const tab = tabs[tabIndex];
      if (!tab.controls) return undefined;
      if (actionMode && tab.actionMenu) return tab.actionMenu.actionHint;
      const text = typeof tab.controls === 'function' ? tab.controls() : tab.controls;
      return chalk.dim(`  ${text}`);
    },
    render: () => {
      const tab = tabs[tabIndex];
      if (detailMode && tab.renderDetail) {
        return tab.renderDetail(selected);
      }
      const body = tab.renderBody(selected);
      let lines = body.lines;
      if (actionMode && tab.actionMenu) {
        lines = [...lines];
        // Strip the ▶ cursor from the selected row — the action menu has its own.
        const selLine = lines[body.selectedLineIdx];
        if (selLine !== undefined) {
          lines[body.selectedLineIdx] = selLine.replace(/(?:\x1b\[[0-9;]*m)*▶(?:\x1b\[[0-9;]*m)*/g, ' ');
        }
        lines.splice(
          body.selectedLineIdx + 1,
          0,
          ...tab.actionMenu.menu.renderLines(),
        );
        if (body.hintLineIdx !== undefined)
          lines[body.hintLineIdx] = tab.actionMenu.actionHint;
      }
      if (!hasTabs) return ["", ...lines];
      const focused = selected === -1;
      const activeFiltered = tabs[tabIndex].isFiltered?.();
      const styleTab = (i: number): string => {
        if (i !== tabIndex) return chalk.dim(` ${tabs[i].label} `);
        if (activeFiltered) return chalk.dim(` ${tabs[i].label} `);
        if (focused) {
          const [r, g, b] = getBannerColorRGB();
          return chalk.bgRgb(r, g, b).black(` ${tabs[i].label} `);
        }
        return getBannerColor().bold(` ${tabs[i].label} `);
      };
      return ["", renderTabBar(tabs, tabIndex, styleTab), "", ...lines];
    },
    onKey: (key, redraw, close) => {
      const tab = tabs[tabIndex];
      let closedHere = false;
      const ctx: ListMenuContext<TResult> = {
        tabIndex,
        getSelected: () => selected,
        setSelected: (n) => {
          selected = n;
        },
        redraw,
        close: (result) => {
          closedHere = true;
          close(result);
        },
        enterDetail: () => {
          detailMode = true;
        },
        openAction: () => {
          if (tab.actionMenu) {
            actionMode = true;
            tab.actionMenu.menu.reset();
          }
        },
      };

      // Detail mode: Esc / Left returns to the list.
      if (detailMode) {
        if (key === ESC || key === LEFT) {
          detailMode = false;
          redraw();
        }
        return;
      }

      // Action mode: delegate to the inline action menu. On select, the base
      // exits action mode and redraws unless onSelect closed the menu (every
      // action either closes or returns to the list/detail).
      if (actionMode && tab.actionMenu) {
        const res = tab.actionMenu.menu.handleKey(key);
        if (res.type === "close") {
          actionMode = false;
          redraw();
        } else if (res.type === "select") {
          actionMode = false;
          tab.actionMenu.onSelect(res.option, ctx);
          if (!closedHere) redraw();
        } else redraw();
        return;
      }

      // Tab-row focus (only reachable with multiple tabs).
      if (selected === -1) {
        if (key === ESC) {
          close(cancelValue());
          return;
        }
        if (key === DOWN) {
          selected = 0;
          redraw();
          return;
        }
        if (key === LEFT) {
          if (tabIndex > 0) tabIndex--;
          redraw();
          return;
        }
        if (key === RIGHT) {
          if (tabIndex < tabs.length - 1) tabIndex++;
          redraw();
          return;
        }
        // Let the tab consume any other key (e.g. config's 'q' to quit).
        tab.onKey?.(key, ctx);
        return;
      }

      if (key === ESC) {
        close(cancelValue());
        return;
      }

      const count = tab.count();
      if (key === UP) {
        if (selected <= 0) {
          if (hasTabs) selected = -1;
          else if (wrap && count > 0) selected = count - 1;
        } else selected--;
        redraw();
        return;
      }
      if (key === DOWN) {
        if (selected >= count - 1) {
          if (wrap && count > 0) selected = 0;
        } else selected++;
        redraw();
        return;
      }

      // Item-focused: let the tab consume the key first.
      if (tab.onKey?.(key, ctx)) return;

      // Base fallbacks: Right opens detail, Enter opens the action menu / onEnter.
      if (key === RIGHT && tab.renderDetail) {
        detailMode = true;
        redraw();
        return;
      }
      if (key === ENTER_CR || key === ENTER_LF) {
        if (tab.actionMenu) {
          actionMode = true;
          tab.actionMenu.menu.reset();
          redraw();
          return;
        }
        tab.onEnter?.(ctx);
      }
    },
  });
}
