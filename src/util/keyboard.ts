/**
 * @role Shared raw-terminal-key detection used by the interactive input handlers.
 *
 * @readwhen
 * You're handling a raw keypress (`data`/`key` string from stdin in raw mode) and need to recognize backspace, which terminals send as either DEL (`\x7f`) or BS (`\x08`) depending on platform/emulator.
 */

/** Terminals send either DEL (0x7f) or BS (0x08) for the backspace key depending on platform/emulator. */
export function isBackspaceKey(key: string): boolean {
  return key === '\x7f' || key === '\x08';
}
