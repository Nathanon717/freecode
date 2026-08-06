# src/cli/chrome/turn-state.ts - Agent-Turn UI State

**Role:** One flag — "an agent turn currently has the floor" — plus the `thinking…` label it drives. Owns nothing else; `bottom-ui.ts` decides where the label draws and what it costs in reserved rows.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
setTurnActive(active: boolean): void

isTurnActive(): boolean

composeThinkingLabel(): string
```
<!-- END GENERATED EXPORTS -->

## Why it is its own module

Two reasons, both structural. `cli/session-modes.ts` sets the flag either side of the agent loop and must not import the renderer to do it; and `bottom-ui.ts` sits at 480 of its 500-line limit, so the label's text and color could not live there.

## The invariant

The label is **not** gated on the flag alone. `bottom-ui.ts` shows it only when the input bar is also up (`showThinking()`), which is what keeps it honest: the tool-approval prompt tears the input bar down, so the label vanishes with it rather than sitting over a confirm dialog — and neither module needs to know about the other. Same shape as the toggle bar's existing "drawn iff the input bar is shown" rule in `composeFooterOutput`.

Slash commands and menus run through `beforeDispatch`, not `beforeAgentCall`, so they never set the flag and correctly show no label.

## Deliberately one flag, not a phase enum

`thinking…` reads as *"the agent has the floor"*, which stays true across the whole turn — including tool execution and retry backoff, where nothing is literally thinking. A verb that tracked phase (`thinking…` vs `working…`) would need a signal plumbed out of `agent/loop.ts` and a second piece of state to keep in sync with this one. Deferred deliberately, not overlooked.

## Read when

Changing when the `thinking…` label appears, or adding another affordance that should follow "a turn is in flight".

## Key neighbors

- `cli/chrome/bottom-ui.ts` — reads both exports; owns `showThinking()`, the reserved row, and the draw
- `cli/session-modes.ts` — the only writer (`beforeAgentCall` / `afterAgentCall`)
- `cli/tools/tool-approval.ts` — reads `isTurnActive()` to pick the cursor-restore path
- `cli/theme.ts` — `rotatingPastel`, the session accent the label is drawn in
