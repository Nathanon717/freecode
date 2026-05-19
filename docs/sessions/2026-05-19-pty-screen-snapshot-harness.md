# PTY Screen-Snapshot Harness

**Date:** 2026-05-19

## What was built

- A PTY-based verification path that drives the real built CLI through a pseudo-terminal (`node-pty`), renders its output with a headless VT emulator (`@xterm/headless`), and asserts against the actual rendered screen.
- A reusable driver (`tests/harness/pty/driver.ts`) exposing `send`, `waitForText`, `waitQuiet`, `settle`, `snapshot` (viewport), `transcript` (scrollback + viewport), and exit tracking.
- A `tty` scenario type (`tests/harness/pty/run-tty-scenario.ts`) wired into `run-scenarios.ts`, with per-step `screenContains` / `screenAbsent` checks against the rendered viewport.
- A sample scenario `tty-autocomplete` covering slash-command suggestions, prefix filtering, tab completion, submit reset, and clean Ctrl-C exit.
- A manual demo tool (`tests/harness/pty/demo.ts`) that prints the live screen after each keystroke.

## Why

Existing non-LLM scenarios run in `--script` mode where stdin is a pipe, so `process.stdin.isTTY` is false and the entire interactive TUI never executes — raw-mode input, autocomplete/suggestions, scroll regions, and the pinned status line (`src/cli/terminal-ui.ts`, `src/cli/input-modes.ts`). That UI could only be checked by a human eyeballing the terminal. The PTY path captures the real rendered screen so nothing is reconstructed: a wrong escape sequence shows up directly in the snapshot.

## Key decisions

- Extended `tests/harness/run-scenarios.ts` rather than adding a parallel runner; a scenario branches to the PTY path only when a `tty` block is present.
- Lazy-`import()` the TTY runner and `require` `node-pty`/`@xterm/headless` at spawn time, so script-mode runs are unaffected if the native addon is unavailable.
- Assert on the rendered viewport (substring `screenContains`/`screenAbsent`) instead of golden full-screen snapshots, to avoid coupling to volatile content; an optional `mask` (regex) is available for things like token counts.
- Settle heuristic: wait for output to go quiet (the UI has a 1s refresh timer), then force-flush the emulator before snapshotting.
- Send typed text and Tab as separate steps — the input handler only treats Tab as completion when the data chunk is exactly `"\t"` (real terminals deliver keystrokes individually).

## Platform note

Built and verified on Linux in the web execution environment. `node-pty` ships ConPTY prebuilds for Windows, so the Windows `npm.cmd run verify:fast` path is expected to work but was not exercised here.

## Files changed

- `tests/harness/pty/driver.ts` (new)
- `tests/harness/pty/run-tty-scenario.ts` (new)
- `tests/harness/pty/demo.ts` (new)
- `tests/scenarios/tty-autocomplete.scenario.json` (new)
- `tests/harness/run-scenarios.ts`
- `docs/testing-scenarios.md`
- `docs/scenarios.md` (generated)
- `package.json`, `package-lock.json`

## How to verify

```powershell
npm.cmd run verify:fast
npx tsx tests/harness/run-scenarios.ts --no-build --only=tty-autocomplete --details
npx tsx tests/harness/pty/demo.ts
```
