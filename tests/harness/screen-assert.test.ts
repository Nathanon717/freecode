// check-tests: orphan — tests the e2e harness itself (tests/harness/pty/screen-assert.ts), not a src/ module
import { describe, expect, it } from 'vitest';
import {
  FG_MODE,
  lineMatches,
  matchBlock,
  matchStyles,
  type ScreenCell,
  type ScreenRow,
} from './pty/screen-assert.js';

/** A row of plain default-coloured cells. */
function plain(text: string): ScreenRow {
  return { text, cells: [...text].map((char) => cell(char)) };
}

function cell(char: string, over: Partial<ScreenCell> = {}): ScreenCell {
  return { char, fg: -1, fgMode: FG_MODE.DEFAULT, bold: false, dim: false, italic: false, ...over };
}

/** A row where the cells behind `text` all carry `attrs`. */
function styled(text: string, attrs: Partial<ScreenCell>): ScreenRow {
  return { text, cells: [...text].map((char) => cell(char, attrs)) };
}

describe('lineMatches', () => {
  it('matches exactly, ignoring only trailing whitespace', () => {
    expect(lineMatches('read(a.ts)', 'read(a.ts)')).toBe(true);
    expect(lineMatches('read(a.ts)   ', 'read(a.ts)')).toBe(true);
  });

  it('keeps leading whitespace significant, since indentation is the point', () => {
    expect(lineMatches('  indented', 'indented')).toBe(false);
  });

  it('treats "*" as any single row', () => {
    expect(lineMatches('anything at all', '*')).toBe(true);
    expect(lineMatches('', '*')).toBe(true);
  });

  it('treats a re: prefix as a regex, for width-dependent rows like the divider', () => {
    expect(lineMatches('─'.repeat(80), 're:^─{80}$')).toBe(true);
    expect(lineMatches('─'.repeat(60), 're:^─{80}$')).toBe(false);
  });
});

describe('matchBlock', () => {
  const screen = ['banner', '', 'Checking a file first.', '', 'read(a.ts)', '  1: export const x = 1;', ''];

  it('finds consecutive rows anywhere on screen', () => {
    expect(matchBlock(screen, ['Checking a file first.', '', 'read(a.ts)'])).toEqual([]);
  });

  it('fails when a blank line is missing — the layout bug substrings cannot see', () => {
    const noBlank = ['Checking a file first.', 'read(a.ts)'];
    expect(matchBlock(noBlank, ['Checking a file first.', '', 'read(a.ts)'])).toHaveLength(1);
  });

  it('fails when a blank line is present but unwanted', () => {
    expect(matchBlock(screen, ['Checking a file first.', 'read(a.ts)'])).toHaveLength(1);
  });

  it('requires the rows to be consecutive', () => {
    expect(matchBlock(screen, ['banner', 'read(a.ts)'])).toHaveLength(1);
  });

  it('bridges an arbitrary number of rows across a "..." gap', () => {
    expect(matchBlock(screen, ['banner', '...', 'read(a.ts)'])).toEqual([]);
  });

  it('a gap matches zero rows, so adjacent segments still pass', () => {
    expect(matchBlock(screen, ['read(a.ts)', '...', '  1: export const x = 1;'])).toEqual([]);
  });

  it('still fails across a gap when a later segment is absent', () => {
    expect(matchBlock(screen, ['banner', '...', 'never printed'])).toHaveLength(1);
  });

  it('reports the differing row so a failure says how the layout was wrong', () => {
    const [failure] = matchBlock(screen, ['Checking a file first.', '', 'write(a.ts)']);
    expect(failure).toContain('want: "write(a.ts)"');
    expect(failure).toContain('got:  "read(a.ts)"');
    expect(failure).toContain('<-- differs');
  });

  it('blames the segment that actually failed, not a trivially-matching first one', () => {
    // "banner" matches on its own, so anchoring the report there would explain
    // nothing; the real miss is in the segment after the gap.
    const [failure] = matchBlock(screen, ['banner', '...', 'read(a.ts)', 'wrong preview']);
    expect(failure).toContain('want: "wrong preview"');
    expect(failure).not.toContain('want: "banner"');
  });

  it('says so plainly when nothing in the block appears at all', () => {
    const [failure] = matchBlock(screen, ['nope', 'also nope']);
    expect(failure).toContain('no expected line appears at all');
  });

  it('an empty expectation is vacuously satisfied', () => {
    expect(matchBlock(screen, [])).toEqual([]);
  });
});

describe('matchStyles', () => {
  const rows: ScreenRow[] = [
    styled('-const a = 1;', { fg: 1, fgMode: FG_MODE.P16 }),
    styled('+const a = 2;', { fg: 2, fgMode: FG_MODE.P16 }),
    styled('unchanged', { fg: 13, fgMode: FG_MODE.P16 }),
    styled('  ... (70 more lines)', { dim: true }),
    styled('typescript', { fg: 0x333333, fgMode: FG_MODE.RGB, bold: true }),
    plain('ordinary text'),
  ];

  it('accepts chalk named colours by the palette index the emulator reports', () => {
    expect(matchStyles(rows, [
      { text: '-const a = 1;', fg: 'red' },
      { text: '+const a = 2;', fg: 'green' },
      { text: 'unchanged', fg: 'magentaBright' },
    ])).toEqual([]);
  });

  it('rejects the wrong colour and names what it actually found', () => {
    const [failure] = matchStyles(rows, [{ text: '-const a = 1;', fg: 'green' }]);
    expect(failure).toContain('expected fg green');
    expect(failure).toContain('got red');
  });

  it('checks dim as an attribute, not a colour', () => {
    expect(matchStyles(rows, [{ text: '(70 more lines)', dim: true }])).toEqual([]);
    expect(matchStyles(rows, [{ text: 'ordinary text', dim: true }])).toHaveLength(1);
  });

  it('matches truecolor targets by hex, as the banner and code fences emit', () => {
    expect(matchStyles(rows, [{ text: 'typescript', fg: '#333333', bold: true }])).toEqual([]);
    expect(matchStyles(rows, [{ text: 'typescript', fg: '#334455' }])).toHaveLength(1);
  });

  it('matches by colour mode alone, for the rotating banner colour', () => {
    // The tool call line's exact pastel advances per launch; "rgb" pins that it
    // is still truecolor-styled without welding the test to one palette entry.
    expect(matchStyles(rows, [{ text: 'typescript', fg: 'rgb' }])).toEqual([]);
    expect(matchStyles(rows, [{ text: '-const a = 1;', fg: 'rgb' }])).toHaveLength(1);
    expect(matchStyles(rows, [{ text: '-const a = 1;', fg: 'palette' }])).toEqual([]);
    expect(matchStyles(rows, [{ text: '-const a = 1;', fg: 'any' }])).toEqual([]);
    expect(matchStyles(rows, [{ text: 'ordinary text', fg: 'any' }])).toHaveLength(1);
  });

  it('matches the default colour explicitly', () => {
    expect(matchStyles(rows, [{ text: 'ordinary text', fg: 'default' }])).toEqual([]);
    expect(matchStyles(rows, [{ text: '-const a = 1;', fg: 'default' }])).toHaveLength(1);
  });

  it('ignores blank cells, whose attributes are real but not worth pinning', () => {
    // The two leading spaces are unstyled here; the assertion still passes.
    const mixed: ScreenRow[] = [{
      text: '  dimmed',
      cells: [cell(' '), cell(' '), ...[...'dimmed'].map((c) => cell(c, { dim: true }))],
    }];
    expect(matchStyles(mixed, [{ text: '  dimmed', dim: true }])).toEqual([]);
  });

  it('reports a target that is not on screen rather than passing vacuously', () => {
    const [failure] = matchStyles(rows, [{ text: 'never printed', fg: 'red' }]);
    expect(failure).toContain('style target not on screen');
  });

  it('flags an all-blank target instead of silently checking nothing', () => {
    const [failure] = matchStyles([plain('   ')], [{ text: '  ', fg: 'red' }]);
    expect(failure).toContain('entirely blank');
  });
});
