# src/cli/banner.ts - Startup Banner

**Role:** Clears the terminal and prints the freecode ASCII banner in a rotating pastel color.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
clearEntireTerminal(): void

clearAndRedrawBanner(): void

getBannerColor(): ChalkInstance

getBannerColorRGB(): [number, number, number]

showBanner(): void

redrawBanner(): void
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `clearEntireTerminal`: resets ANSI state and scroll region; clears both visible and scrollback terminal content.
- `showBanner`: clears terminal and prints banner using the next persisted color (advances color index).
- `getBannerColor`: returns a chalk instance for the current banner pastel color.
- `getBannerColorRGB`: returns the `[r, g, b]` tuple; used by `toggles.ts` for bg rendering.
- `redrawBanner`: clears terminal (including scrollback) and redraws banner without advancing the color.
- `clearAndRedrawBanner`: like `redrawBanner` but preserves scrollback (`\x1b[2J` not `\x1b[3J`); used by the resize handler in `terminal-ui.ts`.

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
