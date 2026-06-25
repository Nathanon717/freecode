# src/cli/toggles.ts - Footer Toggle State

**Role:** Holds runtime state for the footer toggle bar — Ask (tool-confirmation) and Read (read-only mode) — and exposes getters, cyclers, and the renderer used by `terminal-ui.ts`.

## Exports

State accessors:

- `getAskMode()` → `'ask' | 'auto'`
- `isReadOnly()` → `boolean`
- `initAskMode(mode)` — seeds Ask toggle from persisted config at startup
- `cycleByChar(char)` — advances the toggle whose `char` matches; returns `true` when a toggle was found

Rendering:

- `composeToggleBar()` — ANSI string prefixed with grey `ctrl+ `, then each toggle rendered as: char in banner art color (fg when off; bg+black when on) followed by the grey remainder of the first state's label (e.g. `Ask`, `Read`)
- `toggleBarWidth()` — visible character count of the toggle bar

## Adding a new toggle

Add an entry to `ALL_TOGGLES` with a unique `char` and a `states` array (`{ label }[]`), and an initial `index`. The hint label is derived automatically from `states[0].label.slice(1)`. No other changes needed; `composeToggleBar` and `cycleByChar` pick it up automatically. Wire the Ctrl+letter shortcut in `cli/session-modes.ts`.

## Key neighbors

- `cli/terminal-ui.ts` — imports `composeToggleBar` / `toggleBarWidth` to draw the secondary footer row
- `cli/session-modes.ts` — imports `cycleByChar`, `getAskMode`, `initAskMode`, `isReadOnly`
- `cli/session-runner.ts` → `cli/command-dispatcher.ts` → `agent/loop.ts` — `isReadOnly` threads through as `readOnly` in `AgentLoopOptions` to filter tools at creation time
