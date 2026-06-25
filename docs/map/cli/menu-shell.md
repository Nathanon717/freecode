# src/cli/menu-shell.ts - Menu Lifecycle Chrome

**Role:** Owns the terminal lifecycle chrome shared by every interactive raw-mode menu (`/eval`, and — over time — `/config` and `/model`): bottom-UI teardown/restore, readline pause/resume, and the Windows console-mode resets. Wraps the menu body so each menu no longer re-implements this boilerplate.

## Exports

```typescript
interface MenuShellOptions<T> {
  ensureReady?: () => Promise<void>;  // awaited before any terminal state is touched (e.g. ensureStoreReady)
  run: () => Promise<T>;              // menu body: the raw-mode picker plus any post-selection run loop
  onRestore?: () => void;             // extra restore run after setupBottomUI (TTY + active only)
}
runMenuShell<T>(rl: Interface, opts: MenuShellOptions<T>): Promise<T>
```

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
