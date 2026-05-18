# src/cli/banner.ts - Startup Banner

**Role:** Clears the terminal and prints the freecode ASCII banner in a rotating pastel color.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `clearEntireTerminal` | `() => void` | Resets ANSI state, scroll region, and clears visible/scrollback terminal content. |
| `showBanner` | `() => void` | Clears the terminal and prints the banner using the next persisted color. |

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
