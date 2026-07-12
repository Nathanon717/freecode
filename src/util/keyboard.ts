/** Terminals send either DEL (0x7f) or BS (0x08) for the backspace key depending on platform/emulator. */
export function isBackspaceKey(key: string): boolean {
  return key === '\x7f' || key === '\x08';
}
