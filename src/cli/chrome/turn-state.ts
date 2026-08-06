// Whether an agent turn currently has the floor.
//
// One flag, set either side of the agent loop, is the source of truth for every
// "the agent is working" affordance in the bottom UI. It lives here rather than
// in `bottom-ui.ts` so `session-modes.ts` can set it without importing the
// renderer, and so the renderer stays under its line limit.
//
// The `thinking…` label is *not* gated on this flag alone: `bottom-ui.ts` shows
// it only when the input bar is also up. That conjunction is what keeps the
// label honest — the tool-approval prompt tears the input bar down, so the label
// disappears with it instead of sitting over a confirm dialog, and it does so
// without either module knowing about the other. It is the same invariant the
// toggle bar already relies on (see `composeFooterOutput`).
//
// Deliberately one flag, not a phase enum: the label reads as "the agent has the
// floor", which is true for the whole turn including tool execution and retry
// backoff. A verb that tracks phase would need a signal plumbed out of
// `agent/loop.ts` and a second thing to keep in sync with this one.

import { theme } from '../theme.js';

let turnActive = false;

export function setTurnActive(active: boolean): void {
  turnActive = active;
}

export function isTurnActive(): boolean {
  return turnActive;
}

// Flush left, aligning with the toggle bar's `ctrl+ ` rather than the input
// line's `> ` prefix.
export function composeThinkingLabel(): string {
  return theme.rotatingPastel('thinking...');
}
