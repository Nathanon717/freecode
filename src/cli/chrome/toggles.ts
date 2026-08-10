/**
 * @role Holds runtime state for the footer toggle bar — Show toggle names (label visibility), Auto-run tools (tool-confirmation), and Read-only mode — and exposes getters, cyclers, and the renderer used by `bottom-ui.ts`.
 *
 * @readwhen
 * - Changing footer toggle-bar rendering, ANSI styling, or visible width for the S/A/R keys.
 * - Adding or removing a footer toggle state cycled by `cycleByChar` (e.g. a new mode key).
 * - Debugging read-only seeding from headless `-p` runs or `--edit` via `initReadOnly`/`initAskMode`.
 */

import chalk from 'chalk';
import { theme } from '../theme.js';

export type AskMode = 'ask' | 'auto';

interface ToggleState {
  label: string;
}

interface Toggle {
  readonly char: string;
  readonly states: readonly ToggleState[];
  index: number;
}

const _showNames: Toggle = {
  char: 'S',
  states: [
    { label: 'show toggle names' },
    { label: 'off' },
  ],
  index: 1,
};

// On = tools run without confirmation, i.e. AskMode 'auto'.
const _autoRun: Toggle = {
  char: 'A',
  states: [
    { label: 'auto-run tools' },
    { label: 'off' },
  ],
  index: 1,
};

const _read: Toggle = {
  char: 'R',
  states: [
    { label: 'read-only' },
    { label: 'off' },
  ],
  index: 1,
};

const ALL_TOGGLES: Toggle[] = [_showNames, _autoRun, _read];

/**
 * Seed the auto-run toggle from persisted config (called once at startup).
 *
 * The `A` toggle reads as **Auto-run tools**, so its on state (index 0) is
 * `AskMode` `'auto'` and its off state is `'ask'` — the display sense is
 * inverted, while the `AskMode` values and `config.toolConfirmation` are not.
 */
export function initAskMode(mode: AskMode): void {
  _autoRun.index = mode === 'auto' ? 0 : 1;
}

/**
 * Seed the read-only toggle at startup. Interactive sessions leave it off and let
 * the user press Ctrl+R; headless `-p` (`cli/headless-prompt.ts`) seeds it for the
 * whole run — on by default, off under `--edit` — rather than threading a separate
 * read-only flag around. Same reason it forces `initAskMode('auto')`: there is no
 * interactive channel to confirm on, and the off switch for confirmations is here.
 */
export function initReadOnly(on: boolean): void {
  _read.index = on ? 0 : 1;
}

export function getAskMode(): AskMode {
  return _autoRun.index === 0 ? 'auto' : 'ask';
}

export function isReadOnly(): boolean {
  return _read.index === 0;
}

/** State of the leftmost `S` toggle: when on, every toggle renders its full label. Off by default. */
export function areToggleNamesShown(): boolean {
  return _showNames.index === 0;
}

/** Advance the toggle whose display char matches (case-insensitive); false when none does. */
export function cycleByChar(char: string): boolean {
  const t = ALL_TOGGLES.find(t => t.char.toLowerCase() === char.toLowerCase());
  if (!t) return false;
  t.index = (t.index + 1) % t.states.length;
  return true;
}

// Label hint shown after the key char (rest of first state's label, e.g. 'sk' for Ask).
function hintRest(t: Toggle): string {
  return t.states[0].label.slice(1);
}

function renderToggle(t: Toggle): string {
  const isOn = t.index === 0;
  const charPart = isOn ? theme.rotatingPastelBg(t.char) : theme.rotatingPastel(t.char);
  if (!areToggleNamesShown()) return charPart;
  return charPart + theme.mutedHint(hintRest(t));
}

/**
 * The toggle bar as an ANSI string: grey `ctrl+ `, then each toggle's char in
 * banner art colour (foreground when off, background + black when on), single-space
 * separated. Under `areToggleNamesShown()` each char carries the grey remainder of
 * its first state's label. Visible length is `toggleBarWidth()`.
 */
export function composeToggleBar(): string {
  const prefix = chalk.gray('ctrl+ ');
  return prefix + ALL_TOGGLES.map(renderToggle).join(' ');
}

/** Visible (non-ANSI) character count of the toggle bar. */
export function toggleBarWidth(): number {
  const prefixLen = 'ctrl+ '.length;
  const hintExtraLen = areToggleNamesShown()
    ? ALL_TOGGLES.reduce((s, t) => s + hintRest(t).length, 0)
    : 0;
  const toggleChars = ALL_TOGGLES.length; // one char each
  const sepLen = ALL_TOGGLES.length - 1;
  return prefixLen + toggleChars + hintExtraLen + sepLen;
}
