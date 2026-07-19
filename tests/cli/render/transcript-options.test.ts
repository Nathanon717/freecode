import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSCRIPT_MAX_RESULT_LINES,
  getTranscriptRuntimeOptions,
  getTranscriptStream,
} from '../../../src/cli/render/transcript-options.js';

describe('transcript runtime options', () => {
  it('parses transcript runtime options independently from trace json', () => {
    expect(getTranscriptRuntimeOptions({
      FREECODE_TRACE_JSON: 'trace.json',
      FREECODE_TRANSCRIPT_STREAM: 'stdout',
      FREECODE_TRANSCRIPT_MAX_RESULT_LINES: 'all',
    })).toEqual({ stream: 'stdout', maxResultLines: Infinity });

    expect(getTranscriptRuntimeOptions({ FREECODE_TRACE_JSON: 'trace.json' }))
      .toEqual({ stream: 'stderr', maxResultLines: DEFAULT_TRANSCRIPT_MAX_RESULT_LINES });
  });

  it('defaults to stderr and treats an unknown stream name as the default', () => {
    expect(getTranscriptRuntimeOptions({}).stream).toBe('stderr');
    expect(getTranscriptRuntimeOptions({ FREECODE_TRANSCRIPT_STREAM: 'nonsense' }).stream).toBe('stderr');
    expect(getTranscriptRuntimeOptions({ FREECODE_TRANSCRIPT_STREAM: 'null' }).stream).toBe('null');
  });

  it.each([
    ['12', 12],
    ['0', 0],
    ['7.9', 7],
    ['all', Infinity],
    ['ALL', Infinity],
    ['infinity', Infinity],
    ['-3', DEFAULT_TRANSCRIPT_MAX_RESULT_LINES],
    ['abc', DEFAULT_TRANSCRIPT_MAX_RESULT_LINES],
    ['', DEFAULT_TRANSCRIPT_MAX_RESULT_LINES],
  ])('parses max result lines %s as %s', (raw, expected) => {
    expect(getTranscriptRuntimeOptions({ FREECODE_TRANSCRIPT_MAX_RESULT_LINES: raw }).maxResultLines)
      .toBe(expected);
  });

  it('never sets maxResultRows from the environment — it is interactive-only', () => {
    expect(getTranscriptRuntimeOptions({ FREECODE_TRANSCRIPT_MAX_RESULT_LINES: 'all' }).maxResultRows)
      .toBeUndefined();
  });
});

describe('transcript stream routing', () => {
  it('routes to the named stream', () => {
    expect(getTranscriptStream({ stream: 'stdout' })).toBe(process.stdout);
    expect(getTranscriptStream({ stream: 'stderr' })).toBe(process.stderr);
  });

  it('routes null to a sink that swallows writes', () => {
    const sink = getTranscriptStream({ stream: 'null' });
    expect(sink).not.toBe(process.stdout);
    expect(sink).not.toBe(process.stderr);
    expect(() => sink.write('discarded')).not.toThrow();
  });
});
