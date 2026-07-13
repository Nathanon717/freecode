import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import chalk from 'chalk';
import {
  isToolName,
  toolNameHighlightRanges,
  toolNameBeforeCursor,
  styleToolNames,
  parseToolInvocation,
  parseToolArgs,
} from '../../src/cli/tool-invocation.js';

describe('isToolName', () => {
  it('accepts registry names and rejects others', () => {
    expect(isToolName('read')).toBe(true);
    expect(isToolName('list_dir')).toBe(true);
    expect(isToolName('shell_exec')).toBe(true);
    expect(isToolName('reader')).toBe(false);
    expect(isToolName('')).toBe(false);
  });
});

describe('toolNameHighlightRanges', () => {
  it('ranges a leading tool name followed by (', () => {
    expect(toolNameHighlightRanges('read(path=x)')).toEqual([{ start: 0, end: 4 }]);
    expect(toolNameHighlightRanges('  list_dir(')).toEqual([{ start: 2, end: 10 }]);
  });

  it('requires the ( to be present', () => {
    expect(toolNameHighlightRanges('read')).toEqual([]);
    expect(toolNameHighlightRanges('read ')).toEqual([]);
  });

  it('only highlights the leading token, not tool names mid-line', () => {
    expect(toolNameHighlightRanges('please read(x)')).toEqual([]);
    expect(toolNameHighlightRanges('xread(')).toEqual([]);
  });
});

describe('toolNameBeforeCursor', () => {
  it('returns the name when the cursor ends a leading tool token', () => {
    expect(toolNameBeforeCursor('read', 4)).toBe('read');
    expect(toolNameBeforeCursor('  list_dir', 10)).toBe('list_dir');
  });

  it('returns null when the token is not a tool or not leading', () => {
    expect(toolNameBeforeCursor('reader', 6)).toBeNull();
    expect(toolNameBeforeCursor('go read', 7)).toBeNull();
    expect(toolNameBeforeCursor('rea', 3)).toBeNull();
  });

  it('is scoped to the current logical line', () => {
    expect(toolNameBeforeCursor('hello\nread', 10)).toBe('read');
    expect(toolNameBeforeCursor('hi read', 7)).toBeNull();
  });
});

describe('styleToolNames', () => {
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
  let prevLevel: typeof chalk.level;

  beforeAll(() => {
    prevLevel = chalk.level;
    chalk.level = 3; // force colour so the wrapping path is exercised
  });
  afterAll(() => {
    chalk.level = prevLevel;
  });

  it('leaves text untouched when there are no ranges', () => {
    expect(styleToolNames('read()', 0, [])).toBe('read()');
  });

  it('wraps only the highlighted span and preserves visible text', () => {
    const styled = styleToolNames('read(path=x)', 0, [{ start: 0, end: 4 }]);
    expect(stripAnsi(styled)).toBe('read(path=x)');
    expect(styled).not.toBe('read(path=x)'); // colour codes were added
    // The reset closes before the parens, so args are outside the coloured span.
    expect(styled.split('\x1b[39m')[1]).toBe('(path=x)');
  });

  it('colours only the portion of a range within the chunk', () => {
    // chunk starts at absolute offset 2, range covers absolute 0..4
    const styled = styleToolNames('ad(x)', 2, [{ start: 0, end: 4 }]);
    expect(stripAnsi(styled)).toBe('ad(x)');
  });
});

describe('parseToolInvocation', () => {
  it('parses a whole-line tool call', () => {
    expect(parseToolInvocation('read(path=src/index.ts)')).toEqual({
      name: 'read',
      args: { path: 'src/index.ts' },
    });
  });

  it('handles no args and surrounding whitespace', () => {
    expect(parseToolInvocation('  list_dir()  ')).toEqual({ name: 'list_dir', args: {} });
  });

  it('returns null for non-invocations and unknown tools', () => {
    expect(parseToolInvocation('just a message')).toBeNull();
    expect(parseToolInvocation('read the file')).toBeNull();
    expect(parseToolInvocation('notatool(x=1)')).toBeNull();
    expect(parseToolInvocation('read(path=x')).toBeNull(); // unbalanced
  });
});

describe('parseToolArgs', () => {
  it('coerces JSON scalars but keeps bare strings as typed', () => {
    expect(parseToolArgs('path=src/index.ts, limit=50')).toEqual({
      path: 'src/index.ts',
      limit: 50,
    });
    expect(parseToolArgs('include=*.ts')).toEqual({ include: '*.ts' });
  });

  it('supports quoted values with commas', () => {
    expect(parseToolArgs('command="ls, echo hi"')).toEqual({ command: 'ls, echo hi' });
  });

  it('returns an empty object for empty args', () => {
    expect(parseToolArgs('')).toEqual({});
    expect(parseToolArgs('   ')).toEqual({});
  });
});
