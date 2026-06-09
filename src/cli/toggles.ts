import chalk from 'chalk';

export type AskMode = 'ask' | 'auto';

type CircleColor = 'green' | 'grey' | 'yellow' | 'cyan';

interface ToggleState {
  label: string;
  color: CircleColor;
}

interface Toggle {
  readonly char: string;
  readonly states: readonly ToggleState[];
  index: number;
}

const _ask: Toggle = {
  char: 'A',
  states: [
    { label: 'ask',  color: 'green' },
    { label: 'auto', color: 'grey'  },
  ],
  index: 0,
};

const _read: Toggle = {
  char: 'R',
  states: [
    { label: 'read', color: 'green' },
    { label: 'off',  color: 'grey'  },
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

function circle(color: CircleColor): string {
  const dot = '●';
  switch (color) {
    case 'green':  return chalk.green(dot);
    case 'grey':   return chalk.gray(dot);
    case 'yellow': return chalk.yellow(dot);
    case 'cyan':   return chalk.cyan(dot);
  }
}

// Renders the toggle bar string (ANSI included, visible length = toggleBarWidth()).
export function composeToggleBar(): string {
  return ALL_TOGGLES.map(t => t.char + circle(t.states[t.index].color)).join(' ');
}

// Visible (non-ANSI) character count of the toggle bar.
export function toggleBarWidth(): number {
  return ALL_TOGGLES.length * 2 + (ALL_TOGGLES.length - 1);
}
