// Whether an agent turn currently has the floor, and what it is doing.
//
// One flag, set either side of the agent loop, is the source of truth for every
// "the agent is working" affordance in the bottom UI. It lives here rather than
// in `bottom-ui.ts` so `session-modes.ts` can set it without importing the
// renderer, and so the renderer stays under its line limit.
//
// The label is *not* gated on this flag alone: `bottom-ui.ts` shows it only when
// the input bar is also up. That conjunction is what keeps the label honest —
// the tool-approval prompt tears the input bar down, so the label disappears
// with it instead of sitting over a confirm dialog, and it does so without
// either module knowing about the other. It is the same invariant the toggle bar
// already relies on (see `composeFooterOutput`).
//
// The activity verb is an *override on the label text*, not a second flag beside
// `turnActive`. Nothing else reads it, `showThinking()` and `reservedRows()` do
// not consult it, and the label still occupies exactly one row whatever it says
// — so there is no second piece of state to keep in sync, and the whole feature
// cannot affect the scroll-region math.
//
// Only the three tools a user actually waits on get a verb. `read`/`edit`/
// `create`/`list_dir` finish in milliseconds, where a verb would say nothing and
// the swap back would read as a flicker. Model phases (in flight vs. streaming
// vs. reasoning) get no verb either: they are the one distinction that would
// need a signal plumbed out of `agent/loop.ts`, and streamed text is already
// visible in the transcript.

import { theme } from '../theme.js';

let turnActive = false;

/** Tools slow enough to be worth naming. See the note above on the omissions. */
const ACTIVITY_VERBS = {
  grep: 'grepping',
  // `shell_exec` runs `child_process.exec`, which is `/bin/sh` on Unix and
  // cmd.exe on Windows — never bash on either. Hence `shelling`, not `bashing`.
  shell_exec: 'shelling',
  spawn_agent: 'delegating',
} as const;

export type ActivityKind = keyof typeof ACTIVITY_VERBS;

let activity: ActivityKind | null = null;
let onActivityChange: (() => void) | null = null;

export function isActivityKind(name: string): name is ActivityKind {
  return name in ACTIVITY_VERBS;
}

/**
 * Registered by `bottom-ui.ts` so a verb change repaints the label row. Inverted
 * rather than imported directly because `bottom-ui.ts` already imports this
 * module, and the reverse edge would be a cycle.
 */
export function setActivityChangeListener(cb: (() => void) | null): void {
  onActivityChange = cb;
}

export function setActivity(next: ActivityKind | null): void {
  if (activity === next) return;
  activity = next;
  onActivityChange?.();
}

export function setTurnActive(active: boolean): void {
  turnActive = active;
  // Clear silently: the turn ending drops the label's row anyway, so firing the
  // listener here would only add a redundant paint. This is also the backstop
  // that stops a verb stranding if a tool wrapper dies without its `finally`.
  if (!active) activity = null;
}

export function isTurnActive(): boolean {
  return turnActive;
}

// Flush left, aligning with the toggle bar's `ctrl+ ` rather than the input
// line's `> ` prefix.
export function composeThinkingLabel(): string {
  const verb = activity ? ACTIVITY_VERBS[activity] : 'thinking';
  return theme.rotatingPastel(`${verb}...`);
}
