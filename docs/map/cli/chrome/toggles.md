# src/cli/chrome/toggles.ts - Footer Toggle State

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Holds runtime state for the footer toggle bar — Show toggle names (label visibility), Auto-run tools (tool-confirmation), and Read-only mode — and exposes getters, cyclers, and the renderer used by `bottom-ui.ts`.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type AskMode = 'ask' | 'auto';

initAskMode(mode: AskMode): void

initReadOnly(on: boolean): void

getAskMode(): AskMode

isReadOnly(): boolean

areToggleNamesShown(): boolean

cycleByChar(char: string): boolean

composeToggleBar(): string

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

105 / 500 lines (395 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `cycleByChar(char)` — advances the toggle whose `char` matches; returns `true` when a toggle was found.
- `areToggleNamesShown()` — state of the leftmost `S` toggle; when on, every toggle renders its full label. Off by default.
- `getAskMode()` / `initAskMode(mode)` — the `A` toggle reads as **Auto-run tools**, so its on state (index 0) is `AskMode` `'auto'` and its off state is `'ask'`. The `AskMode` values and `config.toolConfirmation` are unchanged; only the display sense is inverted.
- `initReadOnly(on)` — seeds the `R` toggle. Interactive sessions leave it off (the user presses Ctrl+R); [../headless-prompt.md](../headless-prompt.md) seeds it for the whole run — on by default, off under `--edit` — so `-p` reuses this state rather than threading a separate read-only flag. Same reason it forces `initAskMode('auto')`: there is no interactive channel to confirm on, and "off switch for confirmations" already exists here.
- `composeToggleBar()` — ANSI string prefixed with grey `ctrl+ `, then each toggle rendered as its char in banner art color (fg when off; bg+black when on), single-space separated. When `areToggleNamesShown()`, each char is followed by the grey remainder of the first state's label (e.g. `Auto-run tools`, `Read-only`).
- `toggleBarWidth()` — visible character count of the toggle bar.

## Adding a new toggle

Add an entry to `ALL_TOGGLES` with a unique `char` and a `states` array (`{ label }[]`), and an initial `index`. The name label is derived automatically from `states[0].label.slice(1)`. No other changes needed; `composeToggleBar` and `cycleByChar` pick it up automatically. Ctrl+letter is dispatched by `cli/session-modes.ts` through `cycleByChar`, so no per-toggle key wiring is needed.

## Key neighbors

- `cli/chrome/bottom-ui.ts` — imports `composeToggleBar` / `toggleBarWidth` to draw the secondary footer row
- `cli/session-modes.ts` — imports `cycleByChar`, `getAskMode`, `initAskMode`, `isReadOnly`
- `cli/headless-prompt.ts` — imports `initReadOnly`, `initAskMode`, `isReadOnly`, `getAskMode` for `-p`
- `cli/session-runner.ts` → `cli/command-dispatcher.ts` → `agent/loop.ts` — `isReadOnly` threads through as `readOnly` in `AgentLoopOptions` to filter tools at creation time
