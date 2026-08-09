# src/cli/menus/menu-shell.ts - Menu Lifecycle Chrome

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Owns the terminal lifecycle chrome shared by every interactive raw-mode menu (`/eval`, and — over time — `/config` and `/model`): bottom-UI teardown/restore, readline pause/resume, and the Windows console-mode resets. Wraps the menu body so each menu no longer re-implements this boilerplate.

## Read When

- Changing how menus tear down / restore the bottom UI or readline.
- Adding a new interactive menu command (wrap its body in `runMenuShell`).
<!-- END GENERATED MAP INTENT -->

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

/**
 * Owns the terminal lifecycle chrome shared by every interactive raw-mode menu:
 *
 *   1. await ensureReady() (store warmup).
 *   2. Snapshot bottom-UI state, teardownBottomUI(), rl.resume().
 *   3. Run the menu body.
 *   4. finally: rl.pause(); if the bottom UI was active on a TTY, reset stdin
 *      console mode + terminal private modes, setupBottomUI(), onRestore().
 *
 * Does NOT own: the picker render/key loop (see list-menu.ts / runRawPicker),
 * non-TTY fallbacks, or session-state refresh (pass that via onRestore).
 */
runMenuShell<T>(rl: Interface, opts: MenuShellOptions<T>): Promise<T>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/chrome/bottom-ui.ts`](../chrome/bottom-ui.md) ×3, [`cli/menus/raw-picker.ts`](raw-picker.md) ×2
- **Imported by:** [`cli/eval/eval-menu.ts`](../eval/eval-menu.md) ×1, [`commands/config.ts`](../../commands/config.md) ×1, [`commands/model.ts`](../../commands/model.md) ×1

## Tests

`tests/cli/menus/menu-shell.test.ts`. 1 other test file references it.

## Budget

46 / 500 lines (454 to spare).
<!-- END GENERATED MAP FACTS -->

## Responsibilities

1. `await ensureReady?.()` (store warmup) before touching the terminal.
2. Snapshot `isBottomUIActive()`, `teardownBottomUI()`, `rl.resume()`.
3. `run()` the menu body and return its value.
4. `finally`: `rl.pause()`; when the bottom UI was active on a TTY, `resetStdinConsoleMode()` + `resetTerminalPrivateModes()` + `setupBottomUI()` + `onRestore?.()`.

Does **not** own: the picker render/key loop (see `raw-picker.ts` / `list-menu.ts`), non-TTY fallbacks (handle inside `run()`), or session-state refresh (pass via `onRestore`).

## Key neighbors

- `cli/menus/raw-picker.ts` — provides the raw-mode reset helpers and the picker the body runs.
- `cli/eval/custom-eval-menu.ts`, `cli/eval/humaneval-menu.ts` — current adopters.
- `cli/chrome/bottom-ui.ts` — `isBottomUIActive` / `teardownBottomUI` / `setupBottomUI`.
