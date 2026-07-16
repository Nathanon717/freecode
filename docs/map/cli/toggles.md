# src/cli/toggles.ts - Footer Toggle State

**Role:** Holds runtime state for the footer toggle bar — Show toggle names (label visibility), Auto-run tools (tool-confirmation), and Read-only mode — and exposes getters, cyclers, and the renderer used by `bottom-ui.ts`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type AskMode = 'ask' | 'auto';

initAskMode(mode: AskMode): void

getAskMode(): AskMode

isReadOnly(): boolean

areToggleNamesShown(): boolean

cycleByChar(char: string): boolean

composeToggleBar(): string

toggleBarWidth(): number
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `cycleByChar(char)` — advances the toggle whose `char` matches; returns `true` when a toggle was found.
- `areToggleNamesShown()` — state of the leftmost `S` toggle; when on, every toggle renders its full label. Off by default.
- `getAskMode()` / `initAskMode(mode)` — the `A` toggle reads as **Auto-run tools**, so its on state (index 0) is `AskMode` `'auto'` and its off state is `'ask'`. The `AskMode` values and `config.toolConfirmation` are unchanged; only the display sense is inverted.
- `composeToggleBar()` — ANSI string prefixed with grey `ctrl+ `, then each toggle rendered as its char in banner art color (fg when off; bg+black when on), single-space separated. When `areToggleNamesShown()`, each char is followed by the grey remainder of the first state's label (e.g. `Auto-run tools`, `Read-only`).
- `toggleBarWidth()` — visible character count of the toggle bar.

## Adding a new toggle

Add an entry to `ALL_TOGGLES` with a unique `char` and a `states` array (`{ label }[]`), and an initial `index`. The name label is derived automatically from `states[0].label.slice(1)`. No other changes needed; `composeToggleBar` and `cycleByChar` pick it up automatically. Ctrl+letter is dispatched by `cli/session-modes.ts` through `cycleByChar`, so no per-toggle key wiring is needed.

## Key neighbors

- `cli/bottom-ui.ts` — imports `composeToggleBar` / `toggleBarWidth` to draw the secondary footer row
- `cli/session-modes.ts` — imports `cycleByChar`, `getAskMode`, `initAskMode`, `isReadOnly`
- `cli/session-runner.ts` → `cli/command-dispatcher.ts` → `agent/loop.ts` — `isReadOnly` threads through as `readOnly` in `AgentLoopOptions` to filter tools at creation time
