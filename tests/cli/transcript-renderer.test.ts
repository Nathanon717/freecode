import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSCRIPT_MAX_RESULT_LINES,
  TRANSCRIPT_DIVIDER_WIDTH,
  formatArgs,
  formatTranscriptStepDivider,
  formatToolCallLine,
  formatToolErrorLine,
  formatToolResultPreview,
  getTranscriptRuntimeOptions,
} from '../../src/cli/transcript-renderer.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('transcript renderer', () => {
  it('formats tool calls with stable argument rendering', () => {
    expect(stripAnsi(formatToolCallLine('read_file', { path: 'src/index.ts' })))
      .toBe('read_file(path: "src/index.ts")');
    expect(formatArgs({ count: 2, enabled: true })).toBe('count: 2, enabled: true');
  });

  it('formats tool errors consistently', () => {
    expect(stripAnsi(formatToolErrorLine('shell_exec', new Error('boom'))))
      .toBe('shell_exec() failed: boom');
  });

  it('formats visible step dividers for agent iterations', () => {
    expect(stripAnsi(formatTranscriptStepDivider()))
      .toBe('─'.repeat(TRANSCRIPT_DIVIDER_WIDTH));
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
