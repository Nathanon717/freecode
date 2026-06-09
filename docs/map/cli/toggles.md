# src/cli/toggles.ts - Footer Toggle State

**Role:** Holds runtime state for the footer toggle bar — Ask (tool-confirmation) and Read (read-only mode) — and exposes getters, cyclers, and the renderer used by `terminal-ui.ts`.

## Exports

State accessors:

- `getAskMode()` → `'ask' | 'auto'`
- `isReadOnly()` → `boolean`
- `initAskMode(mode)` — seeds Ask toggle from persisted config at startup
- `cycleByChar(char)` — advances the toggle whose `char` matches; returns `true` when a toggle was found

Rendering:

- `composeToggleBar()` — ANSI string `A● R●` (chalk-colored per state)
- `toggleBarWidth()` — visible character count of the toggle bar

## Adding a new toggle

Add an entry to `ALL_TOGGLES` with a unique `char`, a `states` array (`{ label, color }[]`), and an initial `index`. No other changes are needed; `composeToggleBar` and `cycleByChar` pick it up automatically. Wire the Ctrl+letter shortcut in `cli/input-modes.ts`.

## Key neighbors

- `cli/terminal-ui.ts` — imports `composeToggleBar` / `toggleBarWidth` to draw the secondary footer row
- `cli/input-modes.ts` — imports `cycleByChar`, `getAskMode`, `initAskMode`, `isReadOnly`
- `cli/session-runner.ts` → `cli/command-dispatcher.ts` → `agent/loop.ts` — `isReadOnly` threads through as `readOnly` in `AgentLoopOptions` to filter tools at creation time
