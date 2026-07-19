import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import chalk from 'chalk';
import {
  isToolName,
  toolNameHighlightRanges,
  toolNameBeforeCursor,
  styleToolNames,
  parseToolInvocation,
  parseToolArgs,
  buildToolCallSkeleton,
  nextToolFieldCaret,
  toolFieldBackspace,
  stripEmptyToolArgs,
} from '../../../src/cli/tools/tool-invocation.js';

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

  it('keeps commas and = inside a quoted value together (single walker)', () => {
    expect(parseToolArgs('pattern="a=b,c", path=src')).toEqual({
      pattern: 'a=b,c',
      path: 'src',
    });
  });
});

describe('buildToolCallSkeleton', () => {
  it('autofills every param — quotes for strings, bare otherwise — caret in the first slot', () => {
    expect(buildToolCallSkeleton('read')).toEqual({
      text: '(path="", offset=, limit=)',
      caret: 7, // between the quotes of path=""
    });
    expect(buildToolCallSkeleton('list_dir')).toEqual({ text: '(path="")', caret: 7 });
    expect(buildToolCallSkeleton('shell_exec')).toEqual({
      text: '(command="", timeout_ms=, confirmDestructive=)',
      caret: 10,
    });
  });
});

describe('nextToolFieldCaret', () => {
  const buf = 'read(path="", offset=, limit=)';

  it('cycles forward through value slots, wrapping past the last', () => {
    expect(nextToolFieldCaret(buf, 11)).toBe(21); // path -> offset
    expect(nextToolFieldCaret(buf, 21)).toBe(29); // offset -> limit
    expect(nextToolFieldCaret(buf, 29)).toBe(11); // limit -> wraps to path
  });

  it('jumps to the first slot when the caret is outside any slot', () => {
    expect(nextToolFieldCaret(buf, 2)).toBe(11); // caret still in the tool name
  });

  it('returns null for non-tool-call buffers and empty arg lists', () => {
    expect(nextToolFieldCaret('hello world', 3)).toBeNull();
    expect(nextToolFieldCaret('read()', 5)).toBeNull();
  });
});

describe('toolFieldBackspace', () => {
  const buf = 'read(path="", offset=, limit=)';

  it('steps back to the previous slot at an emptied value slot', () => {
    expect(toolFieldBackspace(buf, 21)).toBe(11); // empty offset -> path
    expect(toolFieldBackspace(buf, 29)).toBe(21); // empty limit -> offset
  });

  it('blocks (preserves the skeleton) at the first empty slot', () => {
    expect(toolFieldBackspace(buf, 11)).toBe('block');
  });

  it('lands at the end of the previous filled value', () => {
    const filled = 'read(path="x.ts", offset=, limit=)';
    const closingQuote = filled.indexOf('"', filled.indexOf('"') + 1); // 15
    const emptyOffset = filled.indexOf('offset=') + 'offset='.length; // 25
    expect(toolFieldBackspace(filled, emptyOffset)).toBe(closingQuote);
  });

  it('falls through to a normal delete elsewhere', () => {
    const filled = 'read(path="x.ts", offset=, limit=)';
    expect(toolFieldBackspace(filled, 12)).toBeNull(); // mid path value
    expect(toolFieldBackspace('hello', 3)).toBeNull(); // not a tool call
  });
});

describe('stripEmptyToolArgs', () => {
  it('drops autofilled-but-untouched args on submit', () => {
    expect(stripEmptyToolArgs('read(path="src/x.ts", offset=, limit=)')).toBe(
      'read(path="src/x.ts")',
    );
    expect(stripEmptyToolArgs('read(path="a", offset=5, limit=)')).toBe(
      'read(path="a", offset=5)',
    );
    expect(stripEmptyToolArgs('read(path="", offset=, limit=)')).toBe('read()');
  });

  it('keeps a quoted value that itself contains = and , ', () => {
    expect(
      stripEmptyToolArgs('grep(pattern="a=b,c", path="", include="")'),
    ).toBe('grep(pattern="a=b,c")');
  });

  it('leaves non-tool input and already-clean calls untouched', () => {
    expect(stripEmptyToolArgs('just a message')).toBe('just a message');
    expect(stripEmptyToolArgs('read(path=src/index.ts)')).toBe('read(path=src/index.ts)');
  });
});
