# src/cli/menu-shell.ts - Menu Lifecycle Chrome

**Role:** Owns the terminal lifecycle chrome shared by every interactive raw-mode menu (`/eval`, and — over time — `/config` and `/model`): bottom-UI teardown/restore, readline pause/resume, and the Windows console-mode resets. Wraps the menu body so each menu no longer re-implements this boilerplate.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface MenuShellOptions<T> {
  /** Awaited before any terminal state is touched (e.g. ensureStoreReady). */
  ensureReady?: () => Promise<void>;
  /** The menu body: the raw-mode picker plus any post-selection run loop. */
  run: () => Promise<T>;
  /**
   * Extra restore steps run inside the finally, after setupBottomUI, and only
   * when the bottom UI was active and stdin is a TTY. Use for session-specific
   * footer refresh (resetBottomPromptState, refreshFooterDailySpend, …).
   */
  onRestore?: () => void;
}

runMenuShell<T>(rl: Interface, opts: MenuShellOptions<T>): Promise<T>
```
<!-- END GENERATED EXPORTS -->

## Responsibilities

1. `await ensureReady?.()` (store warmup) before touching the terminal.
2. Snapshot `isBottomUIActive()`, `teardownBottomUI()`, `rl.resume()`.
3. `run()` the menu body and return its value.
4. `finally`: `rl.pause()`; when the bottom UI was active on a TTY, `resetStdinConsoleMode()` + `resetTerminalPrivateModes()` + `setupBottomUI()` + `onRestore?.()`.

Does **not** own: the picker render/key loop (see `raw-picker.ts` / `list-menu.ts`), non-TTY fallbacks (handle inside `run()`), or session-state refresh (pass via `onRestore`).

## Read when

- Changing how menus tear down / restore the bottom UI or readline.
- Adding a new interactive menu command (wrap its body in `runMenuShell`).

## Key neighbors

- `cli/raw-picker.ts` — provides the raw-mode reset helpers and the picker the body runs.
- `cli/scenario-menu.ts`, `commands/humaneval.ts` — current adopters.
- `cli/terminal-ui.ts` — `isBottomUIActive` / `teardownBottomUI` / `setupBottomUI`.
