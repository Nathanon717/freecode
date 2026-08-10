# src/cli/chrome/turn-state.ts - Agent-Turn UI State

<!-- BEGIN GENERATED MAP INTENT -->
## Role

One flag — "an agent turn currently has the floor" — plus the label it drives and the verb that label currently reads. Owns nothing else; `bottom-ui.ts` decides where the label draws and what it costs in reserved rows.

## Read When

Changing when the label appears, changing which tools get a verb, or adding another affordance that should follow "a turn is in flight".
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type ActivityKind = keyof typeof ACTIVITY_VERBS;

isActivityKind(name: string): name is "spawn_agent" | "shell_exec" | "grep"

/**
 * Registered by `bottom-ui.ts` so a verb change repaints the label row. Inverted
 * rather than imported directly because `bottom-ui.ts` already imports this
 * module, and the reverse edge would be a cycle.
 */
setActivityChangeListener(cb: (() => void) | null): void

setActivity(next: "spawn_agent" | "shell_exec" | "grep" | null): void

setTurnActive(active: boolean): void

isTurnActive(): boolean

composeThinkingLabel(): string
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/theme.ts`](../theme.md) ×1
- **Imported by:** [`cli/chrome/bottom-ui.ts`](bottom-ui.md) ×4, [`agent/tools/wrappers.ts`](../../agent/tools/wrappers.md) ×3, [`cli/session-modes.ts`](../session-modes.md) ×2, [`cli/tools/tool-approval.ts`](../tools/tool-approval.md) ×2

## Tests

`tests/cli/chrome/turn-state.test.ts`. 1 other test file references it.

## Budget

82 / 500 lines (418 to spare).
<!-- END GENERATED MAP FACTS -->

## Why it is its own module

Two reasons, both structural. `cli/session-modes.ts` sets the flag either side of the agent loop and must not import the renderer to do it; and `bottom-ui.ts` sits at 485 of its 500-line limit, so the label's text, color, and verb map could not live there.

## The invariant

The label is **not** gated on the flag alone (and never on the verb). `bottom-ui.ts` shows it only when the input bar is also up (`showThinking()`), which is what keeps it honest: the tool-approval prompt tears the input bar down, so the label vanishes with it rather than sitting over a confirm dialog — and neither module needs to know about the other. Same shape as the toggle bar's existing "drawn iff the input bar is shown" rule in `composeFooterOutput`.

Slash commands and menus run through `beforeDispatch`, not `beforeAgentCall`, so they never set the flag and correctly show no label.

## The activity verb

`thinking…` is the base state. While the turn is blocked on one of three slow tools the label instead reads `grepping…`, `shelling…`, or `delegating…`. `agent/tools/wrappers.ts` (`withActivity`) is the only writer; this module owns the verb map and the label text.

**It is an override on the label text, not a second flag beside `turnActive`.** Nothing else reads it, `showThinking()` and `reservedRows()` in `bottom-ui.ts` do not consult it, and the label still occupies exactly one row whatever it says. So there is no second piece of state to keep in sync, and the feature cannot affect the scroll-region math. `setTurnActive(false)` clears it as a backstop, silently — the turn ending drops the label's row anyway, so firing the listener there would only add a redundant paint.

`setActivityChangeListener` is the repaint hook, inverted rather than imported: `bottom-ui.ts` already imports this module, so the reverse edge would be a cycle. Same shape as its existing `setOnResizeCallback`. Repainting on every change is safe because `rotatingPastel` reads `currentBannerColorIdx`, a stable per-session index — the color does not advance per call, so the label cannot flicker between colors.

### Why only three tools, and why not model phases

`read`, `edit`, `create`, and `list_dir` finish in milliseconds. A verb there says nothing, and the swap back reads as a flicker — which is also why `withActivity` waits 150 ms before showing any verb at all.

Model phases (request in flight vs. streaming vs. reasoning) get no verb either. That distinction is the one that would genuinely need a signal plumbed out of `agent/loop.ts`, and streamed text is already visible in the transcript. Retry backoff is likewise left alone: `footer-status.ts` already owns `retryBannerInfo`, with a live countdown that says strictly more than a verb could.

This supersedes an earlier note here arguing for one flag and no phase enum. That argument's premise — that any verb would need a signal out of `agent/loop.ts` — turned out to hold only for model phases. For tool verbs the name is already a plain string in `wrappers.ts`, so the cost was a lookup, not a plumbing job.
