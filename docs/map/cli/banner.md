# src/cli/banner.ts - Startup Banner

**Role:** Clears the terminal and prints the freecode ASCII banner in a rotating pastel color.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `clearEntireTerminal` | `() => void` | Resets ANSI state, scroll region, and clears visible/scrollback terminal content. |
| `showBanner` | `() => void` | Clears the terminal and prints the banner using the next persisted color. |
| `getBannerColor` | `() => ChalkInstance` | Returns a chalk instance for the current banner pastel color. |
| `getBannerColorRGB` | `() => [number, number, number]` | Returns the `[r, g, b]` tuple for the current banner color (used by `toggles.ts` for bg rendering). |
| `redrawBanner` | `() => void` | Clears the terminal (including scrollback) and redraws the banner without advancing the color. |
| `clearAndRedrawBanner` | `() => void` | Like `redrawBanner` but preserves scrollback (`\x1b[2J` not `\x1b[3J`). Used by the resize handler in `terminal-ui.ts`. |

## Color State

The color index is stored at:

```text
$FREECODE_HOME/banner-color.json
```

or, if `FREECODE_HOME` is unset:

```text
~/.config/freecode/banner-color.json
```

Read/write errors are ignored so banner rendering never blocks startup.
