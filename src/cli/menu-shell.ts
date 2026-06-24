import type { Interface } from 'readline';
import { isBottomUIActive, setupBottomUI, teardownBottomUI } from './terminal-ui.js';
import { resetStdinConsoleMode, resetTerminalPrivateModes } from './raw-picker.js';

export interface MenuShellOptions<T> {
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
export async function runMenuShell<T>(rl: Interface, opts: MenuShellOptions<T>): Promise<T> {
  await opts.ensureReady?.();
  const restoreBottomUI = isBottomUIActive();
  teardownBottomUI();
  rl.resume();
  try {
    return await opts.run();
  } finally {
    rl.pause();
    if (restoreBottomUI && process.stdin.isTTY) {
      resetStdinConsoleMode();
      resetTerminalPrivateModes();
      setupBottomUI();
      opts.onRestore?.();
    }
  }
}
