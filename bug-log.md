# Bug Log

## tty-humaneval-fake: "submit — eval menu opens again" fails on Linux

**Scenario:** `tty-humaneval-fake`, step "submit — eval menu opens again"
**Symptom:** `screen missing: "Custom"` — the second eval menu never appeared in the snapshot.
**Platform:** Linux only (passed on Windows).

### Root cause

The step uses `waitFor: "Custom"` to detect that the eval menu opened. On the **first** `/eval` invocation this works correctly: "Custom" isn't in the raw PTY stream yet, so the driver polls until the menu renders (up to 8 s), then settles.

On the **second** invocation, "Custom" is already in the cumulative raw stream from the first menu render. `waitForText` returns immediately, and the default `settle(350 ms)` begins right away.

Between the Enter-key handling output (clearing the input area, echoing `> /eval`) and the eval menu actually rendering, there is an async gap: event-loop scheduling + `runEvalMenuBody`'s sync work (`discoverPlaygroundScenarios`, `loadEvalHistory`, `loadHumanEvalProblems`, etc.). On Linux this gap can exceed 350 ms with no PTY output in between (the footer timer fires every 1 s and may not land in this window). `waitQuiet(350)` then returns before the menu is visible and the snapshot misses "Custom".

On Windows the menu renders fast enough that the gap stays under 350 ms.

### Fix

Added `"quietMs": 1000` to the failing step in `tests/scenarios/tty-humaneval-fake.scenario.json`. This extends the settle period so that any output from the menu rendering (which resets `lastDataAt`) must be followed by 1 000 ms of quiet before the snapshot is taken — giving the menu enough time to appear on all platforms.
