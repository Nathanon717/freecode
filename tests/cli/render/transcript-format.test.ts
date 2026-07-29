import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSCRIPT_MAX_RESULT_LINES,
  TRANSCRIPT_DIVIDER_WIDTH,
} from '../../../src/cli/render/transcript-options.js';
import {
  formatArgs,
  formatCreatedFileContent,
  formatEditFileDiff,
  formatPromptEcho,
  formatTranscriptStepDivider,
  formatToolCallLine,
  formatToolErrorLine,
  formatToolResultPreview,
} from '../../../src/cli/render/transcript-format.js';
import { computeLineDiff } from '../../../src/util/line-diff.js';
import { withLineNumbers } from '../../../src/util/line-numbers.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('transcript formatters', () => {
  it('formats tool calls with stable argument rendering', () => {
    expect(stripAnsi(formatToolCallLine('read', { path: 'src/index.ts' })))
      .toBe('read(src/index.ts)');
    expect(stripAnsi(formatToolCallLine('edit', { path: 'src/foo.ts', old_text: 'a', new_text: 'b' })))
      .toBe('edit(src/foo.ts)');
    expect(stripAnsi(formatArgs({ count: 2, enabled: true }))).toBe('2, true');
  });

  it('formats tool errors consistently', () => {
    expect(stripAnsi(formatToolErrorLine('shell_exec', new Error('boom'))))
      .toBe('shell_exec() failed: boom');
  });

  it('formats visible step dividers for agent iterations', () => {
    const expectedWidth = process.stdout.columns || TRANSCRIPT_DIVIDER_WIDTH;
    expect(stripAnsi(formatTranscriptStepDivider()))
      .toBe('─'.repeat(expectedWidth));
  });


  it('format functions return content without trailing newlines so withToolRendering controls spacing', () => {
    const preview = formatToolResultPreview('line1\nline2', { maxResultLines: Infinity });
    expect(preview.endsWith('\n')).toBe(false);

    const diff = formatEditFileDiff('f.ts', 'old\n', 'new\n');
    expect(diff.endsWith('\n')).toBe(false);
  });

  it('truncates tool result previews by default', () => {
    const result = Array.from({ length: DEFAULT_TRANSCRIPT_MAX_RESULT_LINES + 2 }, (_, i) => `line ${i + 1}`).join('\n');
    const preview = stripAnsi(formatToolResultPreview(result));

    expect(preview).toContain('  line 1');
    expect(preview).toContain(`  line ${DEFAULT_TRANSCRIPT_MAX_RESULT_LINES}`);
    expect(preview).not.toContain(`line ${DEFAULT_TRANSCRIPT_MAX_RESULT_LINES + 1}`);
    expect(preview).toContain('... (2 more lines)');
  });

  it('supports explicit unbounded previews without using trace settings', () => {
    const preview = stripAnsi(formatToolResultPreview('a\nb\nc', { maxResultLines: Infinity }));

    expect(preview).toBe('  a\n  b\n  c');
  });

  it('strips end-of-file footer from read output when not truncated', () => {
    const withEof = '1: line one\n2: line two\n\n(End of file — total 2 lines.)';
    const preview = stripAnsi(formatToolResultPreview(withEof, { maxResultLines: Infinity }));
    expect(preview).toBe('  1: line one\n  2: line two');
    expect(preview).not.toContain('End of file');
  });

  it('preserves truncation footer from read when there are more lines', () => {
    const withMore = '1: line one\n\n(Showing lines 1-1 of 5. Use offset=2 to continue.)';
    const preview = stripAnsi(formatToolResultPreview(withMore, { maxResultLines: Infinity }));
    expect(preview).toContain('Showing lines 1-1 of 5');
  });

  it('formats edit diff with - and + prefixed lines under a line-number gutter', () => {
    const result = stripAnsi(formatEditFileDiff('foo.ts', 'old\n', 'new\n'));
    expect(result).toContain('  1: -old');
    expect(result).toContain('  1: +new');
  });

  it('prepends lineIndent to diff lines when agent strips leading whitespace', () => {
    const result = stripAnsi(formatEditFileDiff('foo.ts', 'old\n', 'new\n', [], [], {}, '    '));
    expect(result).toBe('  1: -    old\n  1: +    new');
  });

  it('shows context lines before and after the changed lines with new-file numbers', () => {
    const result = stripAnsi(formatEditFileDiff('foo.ts', 'old\n', 'new\n', ['ctx1', 'ctx2'], ['ctx3', 'ctx4']));
    expect(result).toBe('  1:  ctx1\n  2:  ctx2\n  3: -old\n  3: +new\n  4:  ctx3\n  5:  ctx4');
  });

  it('numbers from startLine, keeping old-file numbers on removed lines', () => {
    const result = stripAnsi(
      formatEditFileDiff('foo.ts', 'a\nb\n', 'x\n', [], [], {}, '', 10),
    );
    // removals take old-file numbers (10, 11); the addition takes the new-file number (10)
    expect(result).toBe('  10: -a\n  11: -b\n  10: +x');
  });

  it('right-aligns the gutter so colons line up across digit widths', () => {
    const old = Array.from({ length: 3 }, (_, i) => `line${i}`).join('\n');
    const result = stripAnsi(
      formatEditFileDiff('foo.ts', old, 'z', [], [], { maxResultLines: Infinity }, '', 9),
    );
    // lines 9, 10, 11 removed → gutter padded to width 2, colons aligned
    expect(result).toBe('   9: -line0\n  10: -line1\n  11: -line2\n   9: +z');
  });

  it('omits context when arrays are empty', () => {
    const result = stripAnsi(formatEditFileDiff('foo.ts', 'a\nb\n', 'c\n'));
    expect(result).toBe('  1: -a\n  2: -b\n  1: +c');
  });

  it('right-aligns read/create line numbers so colons align across digit widths', () => {
    const numbered = withLineNumbers(9, ['a', 'b', 'c']);
    expect(numbered).toEqual([' 9: a', '10: b', '11: c']);
  });

  it('formats created file content with a line-number gutter starting at 1', () => {
    const preview = stripAnsi(formatCreatedFileContent('first\nsecond\nthird', { maxResultLines: Infinity }));
    expect(preview).toBe('  1: first\n  2: second\n  3: third');
  });

  it('drops the trailing newline so create previews carry no blank final gutter', () => {
    const preview = stripAnsi(formatCreatedFileContent('only\n', { maxResultLines: Infinity }));
    expect(preview).toBe('  1: only');
  });

  it('computes LCS-based line diff correctly', () => {
    const diff = computeLineDiff(
      ['a', 'b', 'c', 'd'],
      ['a', 'x', 'c', 'd'],
    );
    expect(diff).toEqual([
      { type: 'equal', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'equal', text: 'c' },
      { type: 'equal', text: 'd' },
    ]);
  });

  it('shows wasteful unchanged lines once in magenta and only truly changed lines in red/green', () => {
    const oldText = 'header\nold_line\nfooter\n';
    const newText = 'header\nnew_line\nfooter\n';
    const result = stripAnsi(formatEditFileDiff('f.py', oldText, newText, [], [], { maxResultLines: Infinity }));
    // equal lines appear once with space prefix (not duplicated as -/+)
    expect(result).toBe('  1:  header\n  2: -old_line\n  2: +new_line\n  3:  footer');
    // equal lines should not appear with - or + prefix
    expect(result).not.toContain('-header');
    expect(result).not.toContain('+header');
    expect(result).not.toContain('-footer');
    expect(result).not.toContain('+footer');
  });

  it('truncates diff lines when total exceeds maxResultLines', () => {
    const old = Array.from({ length: 20 }, (_, i) => `old${i}`).join('\n');
    const result = stripAnsi(formatEditFileDiff('foo.ts', old, 'new', [], [], { maxResultLines: 5 }));
    expect(result).toContain('... (');
    expect(result).not.toContain('old5');
  });

  it('trims the diff to maxResultRows so the header stays on screen during approval', () => {
    const old = Array.from({ length: 10 }, (_, i) => `old${i}`).join('\n');
    // 10 removed lines + 1 added line = 11 rendered rows; a 4-row budget keeps 3
    // (one row reserved for the "more lines" note) and reports the rest.
    const result = stripAnsi(formatEditFileDiff('foo.ts', old, 'new', [], [], { maxResultRows: 4 }));
    expect(result.split('\n')[0]).toContain('-old0');
    expect(result).toContain('... (8 more lines)');
    expect(result).not.toContain('old5');
  });
  it('echoes a prompt with "> " and indents continuation lines to match', () => {
    expect(stripAnsi(formatPromptEcho('one'))).toBe('> one');
    expect(stripAnsi(formatPromptEcho('one\ntwo'))).toBe('> one\n  two');
  });

  it('joins echo lines with the eol the caller needs, since raw mode wants a carriage return', () => {
    expect(stripAnsi(formatPromptEcho('one\ntwo', '\r\n'))).toBe('> one\r\n  two');
  });
});
