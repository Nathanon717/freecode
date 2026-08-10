# src/cli/chrome/toggles.ts - Footer Toggle State

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Holds runtime state for the footer toggle bar — Show toggle names (label visibility), Auto-run tools (tool-confirmation), and Read-only mode — and exposes getters, cyclers, and the renderer used by `bottom-ui.ts`.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type AskMode = 'ask' | 'auto';

/**
 * Seed the auto-run toggle from persisted config (called once at startup).
 *
 * The `A` toggle reads as **Auto-run tools**, so its on state (index 0) is
 * `AskMode` `'auto'` and its off state is `'ask'` — the display sense is
 * inverted, while the `AskMode` values and `config.toolConfirmation` are not.
 */
initAskMode(mode: AskMode): void

/**
 * Seed the read-only toggle at startup. Interactive sessions leave it off and let
 * the user press Ctrl+R; headless `-p` (`cli/headless-prompt.ts`) seeds it for the
 * whole run — on by default, off under `--edit` — rather than threading a separate
 * read-only flag around. Same reason it forces `initAskMode('auto')`: there is no
 * interactive channel to confirm on, and the off switch for confirmations is here.
 */
initReadOnly(on: boolean): void

getAskMode(): AskMode

isReadOnly(): boolean

/**
 * State of the leftmost `S` toggle: when on, every toggle renders its full label. Off by default.
 */
areToggleNamesShown(): boolean

/**
 * Advance the toggle whose display char matches (case-insensitive); false when none does.
 */
cycleByChar(char: string): boolean

/**
 * The toggle bar as an ANSI string: grey `ctrl+ `, then each toggle's char in
 * banner art colour (foreground when off, background + black when on), single-space
 * separated. Under `areToggleNamesShown()` each char carries the grey remainder of
 * its first state's label. Visible length is `toggleBarWidth()`.
 */
composeToggleBar(): string

/**
 * Visible (non-ANSI) character count of the toggle bar.
 */
toggleBarWidth(): number
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/theme.ts`](../theme.md) ×3
- **Imported by:** [`cli/session-modes.ts`](../session-modes.md) ×5, [`cli/headless-prompt.ts`](../headless-prompt.md) ×4, [`cli/chrome/bottom-ui.ts`](bottom-ui.md) ×2

## Tests

`tests/cli/chrome/toggles.test.ts`. 2 other test files reference it.

## Budget

121 / 500 lines (379 to spare).
<!-- END GENERATED MAP FACTS -->

## Adding a new toggle

Add an entry to `ALL_TOGGLES` with a unique `char` and a `states` array (`{ label }[]`), and an initial `index`. The name label is derived automatically from `states[0].label.slice(1)`. No other changes needed; `composeToggleBar` and `cycleByChar` pick it up automatically. Ctrl+letter is dispatched by `cli/session-modes.ts` through `cycleByChar`, so no per-toggle key wiring is needed.
