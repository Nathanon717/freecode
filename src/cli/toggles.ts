import chalk from 'chalk';
import { getBannerColorRGB } from './banner.js';

let ctrlHintActive = false;

export function setCtrlHint(active: boolean): void {
  ctrlHintActive = active;
}

export type AskMode = 'ask' | 'auto';

interface ToggleState {
  label: string;
}

interface Toggle {
  readonly char: string;
  readonly states: readonly ToggleState[];
  index: number;
}

const _ask: Toggle = {
  char: 'A',
  states: [
    { label: 'ask' },
    { label: 'auto' },
  ],
  index: 0,
};

const _read: Toggle = {
  char: 'R',
  states: [
    { label: 'read' },
    { label: 'off' },
  ],
  index: 1,
};

const ALL_TOGGLES: Toggle[] = [_ask, _read];

// Seed Ask toggle from persisted config (called once at startup).
export function initAskMode(mode: AskMode): void {
  _ask.index = mode === 'auto' ? 1 : 0;
}

export function getAskMode(): AskMode {
  return _ask.states[_ask.index].label as AskMode;
}

export function isReadOnly(): boolean {
  return _read.index === 0;
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
  if (ctrlHintActive) {
    const rest = hintRest(t);
    const charPart = isOn ? chalk.bgRgb(r, g, b).black(t.char) : chalk.rgb(r, g, b)(t.char);
    return charPart + chalk.rgb(128, 128, 128)(rest);
  }
  if (isOn) return chalk.bgRgb(r, g, b).black(t.char);
  return chalk.rgb(r, g, b)(t.char);
}

// Renders the toggle bar string (ANSI included, visible length = toggleBarWidth()).
export function composeToggleBar(): string {
  const prefix = chalk.gray('ctrl+ ');
  return prefix + ALL_TOGGLES.map(renderToggle).join('  ');
}

// Visible (non-ANSI) character count of the toggle bar.
export function toggleBarWidth(): number {
  const prefixLen = 'ctrl+ '.length;
  const hintExtraLen = ctrlHintActive
    ? ALL_TOGGLES.reduce((s, t) => s + hintRest(t).length, 0)
    : 0;
  const toggleChars = ALL_TOGGLES.length; // one char each
  const sepLen = (ALL_TOGGLES.length - 1) * 2;
  return prefixLen + toggleChars + hintExtraLen + sepLen;
}
