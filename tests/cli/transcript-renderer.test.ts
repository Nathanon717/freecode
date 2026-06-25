import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TRANSCRIPT_MAX_RESULT_LINES,
  TRANSCRIPT_DIVIDER_WIDTH,
  formatArgs,
  formatEditFileDiff,
  formatTranscriptStepDivider,
  formatToolCallLine,
  formatToolErrorLine,
  formatToolResultPreview,
  getTranscriptRuntimeOptions,
  writeTranscriptStepDivider,
} from '../../src/cli/transcript-renderer.js';
import { computeLineDiff } from '../../src/util/line-diff.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('transcript renderer', () => {
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

  it('step divider writes divider followed by two newlines for blank-line spacing', () => {
    const expectedWidth = process.stdout.columns || TRANSCRIPT_DIVIDER_WIDTH;
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });
    try {
      writeTranscriptStepDivider({ stream: 'stdout', maxResultLines: 30 });
    } finally {
      spy.mockRestore();
    }
    const output = chunks.join('');
    expect(stripAnsi(output)).toBe('─'.repeat(expectedWidth) + '\n\n');
  });

  it('format functions return content without trailing newlines so withLogging controls spacing', () => {
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

  it('formats edit diff with - and + prefixed lines', () => {
    const result = stripAnsi(formatEditFileDiff('foo.ts', 'old\n', 'new\n'));
    expect(result).toContain('  -old');
    expect(result).toContain('  +new');
  });

  it('prepends lineIndent to diff lines when agent strips leading whitespace', () => {
    const result = stripAnsi(formatEditFileDiff('foo.ts', 'old\n', 'new\n', [], [], {}, '    '));
    expect(result).toBe('  -    old\n  +    new');
  });

  it('shows context lines before and after the changed lines', () => {
    const result = stripAnsi(formatEditFileDiff('foo.ts', 'old\n', 'new\n', ['ctx1', 'ctx2'], ['ctx3', 'ctx4']));
    expect(result).toBe('   ctx1\n   ctx2\n  -old\n  +new\n   ctx3\n   ctx4');
  });

  it('omits context when arrays are empty', () => {
    const result = stripAnsi(formatEditFileDiff('foo.ts', 'a\nb\n', 'c\n'));
    expect(result).toBe('  -a\n  -b\n  +c');
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
    expect(result).toBe('   header\n  -old_line\n  +new_line\n   footer');
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

  it('parses transcript runtime options independently from trace json', () => {
    expect(getTranscriptRuntimeOptions({
      FREECODE_TRACE_JSON: 'trace.json',
      FREECODE_TRANSCRIPT_STREAM: 'stdout',
      FREECODE_TRANSCRIPT_MAX_RESULT_LINES: 'all',
    })).toEqual({ stream: 'stdout', maxResultLines: Infinity });

    expect(getTranscriptRuntimeOptions({ FREECODE_TRACE_JSON: 'trace.json' }))
      .toEqual({ stream: 'stderr', maxResultLines: DEFAULT_TRANSCRIPT_MAX_RESULT_LINES });
  });
});
