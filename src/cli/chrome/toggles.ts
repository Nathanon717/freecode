import chalk from 'chalk';
import { getBannerColorRGB } from '../render/banner.js';

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

// Seed the auto-run toggle from persisted config (called once at startup).
export function initAskMode(mode: AskMode): void {
  _autoRun.index = mode === 'auto' ? 0 : 1;
}

// Seed the read-only toggle at startup. Interactive sessions leave it off and let
// the user press Ctrl+R; the headless `-p` mode forces it on for the whole run
// (cli/headless-prompt.ts) rather than passing a separate read-only flag around.
export function initReadOnly(on: boolean): void {
  _read.index = on ? 0 : 1;
}

export function getAskMode(): AskMode {
  return _autoRun.index === 0 ? 'auto' : 'ask';
}

export function isReadOnly(): boolean {
  return _read.index === 0;
}

export function areToggleNamesShown(): boolean {
  return _showNames.index === 0;
}

// Advance a toggle by its display character (case-insensitive).
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
  const [r, g, b] = getBannerColorRGB();
  const isOn = t.index === 0;
  const charPart = isOn ? chalk.bgRgb(r, g, b).black(t.char) : chalk.rgb(r, g, b)(t.char);
  if (!areToggleNamesShown()) return charPart;
  return charPart + chalk.rgb(128, 128, 128)(hintRest(t));
}

// Renders the toggle bar string (ANSI included, visible length = toggleBarWidth()).
export function composeToggleBar(): string {
  const prefix = chalk.gray('ctrl+ ');
  return prefix + ALL_TOGGLES.map(renderToggle).join(' ');
}

// Visible (non-ANSI) character count of the toggle bar.
export function toggleBarWidth(): number {
  const prefixLen = 'ctrl+ '.length;
  const hintExtraLen = areToggleNamesShown()
    ? ALL_TOGGLES.reduce((s, t) => s + hintRest(t).length, 0)
    : 0;
  const toggleChars = ALL_TOGGLES.length; // one char each
  const sepLen = ALL_TOGGLES.length - 1;
  return prefixLen + toggleChars + hintExtraLen + sepLen;
}
