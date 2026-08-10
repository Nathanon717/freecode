# src/cli/render/banner.ts - Startup Banner

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Clears the terminal and prints the freecode ASCII banner in a rotating pastel color.

## Read When

- Changing the rotating pastel banner color persisted in `banner-color.json`.
- Debugging terminal clear/redraw behaviour when the banner is the only thing on screen.
- Adding or tuning the compact/full banner switch at the 82-column width threshold.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Reset ANSI state and the scroll region, then clear both the visible screen and scrollback.
 */
clearEntireTerminal(): void

/**
 * Like `redrawBanner()` but preserves scrollback (`\x1b[2J`, not `\x1b[3J`) — the
 * resize handler in `bottom-ui.ts` calls it only when the banner is the one thing
 * on screen (no transcript yet), to redraw it responsively at the new width.
 */
clearAndRedrawBanner(): void

/**
 * A chalk instance for the current banner pastel.
 */
getBannerColor(): ChalkInstance

/**
 * The current banner pastel as an `[r, g, b]` tuple. `cli/theme.ts` wraps it as
 * the `rotatingPastel` / `rotatingPastelBg` tokens; background-styled call sites
 * go through those rather than building `chalk.bgRgb(...)` themselves.
 */
getBannerColorRGB(): [number, number, number]

/**
 * Clear the terminal and print the banner in the next persisted colour, advancing the colour index.
 */
showBanner(): void

/**
 * Clear the terminal (scrollback included) and redraw the banner without advancing the colour.
 */
redrawBanner(): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`util/screen-buffer.ts`](../../util/screen-buffer.md) ×3
- **Imported by:** [`cli/menus/model-screen.ts`](../menus/model-screen.md) ×5, [`cli/render/transcript-format.ts`](transcript-format.md) ×5, [`commands/config.ts`](../../commands/config.md) ×5, [`cli/chrome/bottom-ui.ts`](../chrome/bottom-ui.md) ×4, [`cli/eval/eval-screen.ts`](../eval/eval-screen.md) ×4, [`cli/eval/humaneval-menu.ts`](../eval/humaneval-menu.md) ×3, [`cli/theme.ts`](../theme.md) ×2, [`cli/command-dispatcher.ts`](../command-dispatcher.md) ×1, +4 more

## Tests

`tests/cli/render/banner.test.ts`. 7 other test files reference it.

## Budget

135 / 500 lines (365 to spare).

## Env

`FREECODE_HOME`
<!-- END GENERATED MAP FACTS -->

## Behavior

Every function that draws the banner (`showBanner`, `redrawBanner`, `clearAndRedrawBanner`) calls `startOverlayEpoch()` from `screen-buffer.ts` right after printing, so the just-drawn banner is treated as chrome and excluded from slash-suggestion overlay repaints. This must happen on every mid-session redraw (/clear, /model, /config, /eval, and a fresh-screen resize), not just startup — otherwise a reprinted banner leaks into overlay repaints and appears where suggestions shrink.

## Color State

This file owns the pastel ring and the rotation index. `cli/theme.ts` only *reads* the current entry, so the dependency is one-way (banner never imports theme) and the ~30 `getBannerColor()` call sites plus the seven test files that mock this module are unaffected by the token layer.

The color index is stored at:

```text
$FREECODE_HOME/banner-color.json
```

or, if `FREECODE_HOME` is unset:

```text
~/.config/freecode/banner-color.json
```

Read/write errors are ignored so banner rendering never blocks startup.
