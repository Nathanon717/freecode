// Layout and style matchers for the rendered TTY screen.
//
// Kept free of node-pty and @xterm/headless so they can be unit-tested in the
// normal suite: everything here takes plain rows/cells in and returns failure
// strings out. `driver.ts` produces the input; `run-tty-e2e.ts` consumes the
// output.
//
// Substring assertions (screenContains and friends) cannot express layout — a
// blank line in the wrong place, a missing divider, a preview that lost its
// indent all pass. These matchers close that: `matchBlock` pins consecutive
// rows exactly, and `matchStyles` pins the colour/attribute of the cells behind
// them.

/** One rendered cell, with the attributes the emulator reports for it. */
export interface ScreenCell {
  char: string;
  /** Palette index, packed RGB, or -1 for the terminal default. */
  fg: number;
  /** Emulator colour mode: 0 default, P16/P256 palette, or RGB. See FG_MODE. */
  fgMode: number;
  bold: boolean;
  dim: boolean;
  italic: boolean;
}

export interface ScreenRow {
  /** The row as plain text, trailing unwritten cells dropped. */
  text: string;
  cells: ScreenCell[];
}

/**
 * Colour modes as @xterm/headless reports them. Named colours (chalk.red,
 * chalk.magentaBright, …) arrive as P16 regardless of chalk's own level, since
 * chalk emits basic SGR for them; only .rgb()/.hex() reach RGB.
 */
export const FG_MODE = {
  DEFAULT: 0,
  P16: 0x1000000,
  P256: 0x2000000,
  RGB: 0x3000000,
} as const;

/** Chalk's named colours, in the palette order the emulator indexes them by. */
const PALETTE: Record<string, number> = {
  black: 0, red: 1, green: 2, yellow: 3, blue: 4, magenta: 5, cyan: 6, white: 7,
  blackBright: 8, redBright: 9, greenBright: 10, yellowBright: 11,
  blueBright: 12, magentaBright: 13, cyanBright: 14, whiteBright: 15,
  // chalk's own aliases for the bright range
  gray: 8, grey: 8,
};

/** A block line that matches any single row, so volatile content can be skipped. */
export const ANY_LINE = '*';
/** A block token that matches zero or more consecutive rows. */
export const GAP = '...';

/**
 * True when `expected` describes `actual`.
 *
 * `re:<pattern>` tests as a regex; `*` matches anything; otherwise the row must
 * match exactly, ignoring trailing whitespace only. Leading whitespace is
 * significant — indentation is exactly the thing these assertions exist to pin.
 */
export function lineMatches(actual: string, expected: string): boolean {
  if (expected === ANY_LINE) return true;
  if (expected.startsWith('re:')) return new RegExp(expected.slice(3)).test(actual);
  return actual.replace(/\s+$/, '') === expected.replace(/\s+$/, '');
}

/** Split a block on GAP tokens into runs of lines that must be consecutive. */
function toSegments(expected: string[]): string[][] {
  const segments: string[][] = [];
  let current: string[] = [];
  for (const line of expected) {
    if (line === GAP) {
      segments.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  segments.push(current);
  return segments.filter((s) => s.length > 0);
}

/** Does `segment` match rows starting exactly at `at`? */
function segmentAt(rows: string[], segment: string[], at: number): boolean {
  if (at + segment.length > rows.length) return false;
  return segment.every((line, i) => lineMatches(rows[at + i], line));
}

/**
 * Find where `segments` match in order, each after the previous, allowing any
 * number of rows between them (that is what a GAP token bought). Returns the
 * row the first segment matched at, or -1.
 */
function findSegments(rows: string[], segments: string[][], from: number): number {
  const [head, ...rest] = segments;
  for (let at = from; at + head.length <= rows.length; at++) {
    if (!segmentAt(rows, head, at)) continue;
    if (rest.length === 0) return at;
    if (findSegments(rows, rest, at + head.length) !== -1) return at;
  }
  return -1;
}

/**
 * Assert that `expected` appears as consecutive rows somewhere in `rows`.
 *
 * Blank lines are significant — `""` must match an empty row — which is what
 * makes this able to enforce the transcript's divider spacing contract.
 * Returns an empty array on success, or a single diagnostic showing the closest
 * candidate so a failure says *how* the layout was wrong, not just that it was.
 */
export function matchBlock(rows: string[], expected: string[]): string[] {
  if (expected.length === 0) return [];
  const segments = toSegments(expected);
  if (segments.length === 0) return [];
  if (findSegments(rows, segments, 0) !== -1) return [];
  return [`block not found on screen:\n${describeBlockFailure(rows, blameSegment(rows, segments))}`];
}

/**
 * Pick the segment worth showing the author. A block split by gaps usually
 * fails in one specific segment, and anchoring the report on the first one
 * (often a single line that matches fine) explains nothing. Prefer the first
 * segment that matches nowhere at all; if every segment matches on its own, the
 * failure is ordering or adjacency, so show the largest.
 */
function blameSegment(rows: string[], segments: string[][]): string[] {
  const unmatched = segments.find(
    (segment) => !rows.some((_, at) => segmentAt(rows, segment, at)),
  );
  if (unmatched) return unmatched;
  return segments.reduce((a, b) => (b.length > a.length ? b : a));
}

/**
 * Best-effort explanation of a block miss: anchor on the first expected line
 * that does appear, and show the rows around it against what was wanted. A bare
 * "not found" leaves the author diffing 40 rows by eye.
 */
function describeBlockFailure(rows: string[], segment: string[]): string {
  let anchor = -1;
  let anchorLine = 0;
  for (let i = 0; i < segment.length && anchor === -1; i++) {
    if (segment[i] === ANY_LINE) continue;
    anchor = rows.findIndex((row) => lineMatches(row, segment[i]));
    anchorLine = i;
  }
  const want = segment.map((l) => `    want: ${JSON.stringify(l)}`).join('\n');
  if (anchor === -1) return `${want}\n    (no expected line appears at all)`;

  const start = Math.max(0, anchor - anchorLine);
  const got = rows
    .slice(start, start + segment.length)
    .map((row, i) => `    got:  ${JSON.stringify(row)}${lineMatches(row, segment[i] ?? '') ? '' : '   <-- differs'}`)
    .join('\n');
  return `${want}\n${got}`;
}

export interface StyleExpectation {
  /** Substring to locate on a rendered row; every non-blank cell of it is checked. */
  text: string;
  /**
   * Colour name ("red", "magentaBright"), "#rrggbb", or one of the mode-only
   * matchers: "default", "any" (anything but default), "rgb", "palette".
   *
   * The mode-only forms exist for text drawn in the rotating banner colour —
   * tool call lines, rationales, the "> " prompt echo. That colour is picked
   * from a palette that advances per launch, so "rgb" pins that the element is
   * still coloured without welding the test to one pastel.
   */
  fg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
}

/** Does this cell carry the colour `want` names? */
function fgMatches(cell: ScreenCell, want: string): boolean {
  if (want === 'default') return cell.fgMode === FG_MODE.DEFAULT;
  if (want === 'any') return cell.fgMode !== FG_MODE.DEFAULT;
  if (want === 'rgb') return cell.fgMode === FG_MODE.RGB;
  if (want === 'palette') return cell.fgMode === FG_MODE.P16 || cell.fgMode === FG_MODE.P256;
  if (want.startsWith('#')) {
    const rgb = parseInt(want.slice(1), 16);
    return cell.fgMode === FG_MODE.RGB && cell.fg === rgb;
  }
  const index = PALETTE[want];
  if (index === undefined) return false;
  // Indices 0-15 are legal in both palette modes; accept either so a switch
  // between chalk's 16- and 256-colour output does not break every test.
  return (cell.fgMode === FG_MODE.P16 || cell.fgMode === FG_MODE.P256) && cell.fg === index;
}

function describeFg(cell: ScreenCell): string {
  if (cell.fgMode === FG_MODE.DEFAULT) return 'default';
  if (cell.fgMode === FG_MODE.RGB) return `#${cell.fg.toString(16).padStart(6, '0')}`;
  const name = Object.keys(PALETTE).find((k) => PALETTE[k] === cell.fg);
  return name ?? `palette(${cell.fg})`;
}

/**
 * Assert that the cells behind `text` carry the expected colour and attributes.
 *
 * Only non-blank cells are checked: a space carries whatever attributes were
 * active when it was written, which is real but not something a test should be
 * pinned to. Column indexes come from the row's plain text, so a row containing
 * double-width characters left of the match would skew — none of the transcript
 * output does.
 */
export function matchStyles(rows: ScreenRow[], expectations: StyleExpectation[]): string[] {
  const failures: string[] = [];

  for (const want of expectations) {
    const row = rows.find((r) => r.text.includes(want.text));
    if (!row) {
      failures.push(`style target not on screen: ${JSON.stringify(want.text)}`);
      continue;
    }
    const from = row.text.indexOf(want.text);
    const cells = row.cells.slice(from, from + want.text.length).filter((c) => c.char.trim() !== '');
    if (cells.length === 0) {
      failures.push(`style target ${JSON.stringify(want.text)} is entirely blank — nothing to check`);
      continue;
    }

    if (want.fg !== undefined) {
      const bad = cells.find((c) => !fgMatches(c, want.fg!));
      if (bad) {
        failures.push(
          `${JSON.stringify(want.text)}: expected fg ${want.fg}, got ${describeFg(bad)} at ${JSON.stringify(bad.char)}`,
        );
      }
    }
    for (const attr of ['bold', 'dim', 'italic'] as const) {
      if (want[attr] === undefined) continue;
      const bad = cells.find((c) => c[attr] !== want[attr]);
      if (bad) {
        failures.push(
          `${JSON.stringify(want.text)}: expected ${attr}=${want[attr]}, got ${!want[attr]} at ${JSON.stringify(bad.char)}`,
        );
      }
    }
  }

  return failures;
}
