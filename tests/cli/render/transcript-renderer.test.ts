import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRANSCRIPT_DIVIDER_WIDTH } from '../../../src/cli/render/transcript-options.js';
import {
  beginTranscriptTurn,
  endTranscriptStep,
  resetTranscriptTurnState,
  writeStepSeparator,
  writeTranscriptText,
  type TranscriptRuntimeOptions,
} from '../../../src/cli/render/transcript-renderer.js';
import {
  clearTranscriptRecord,
  getTranscriptRecord,
} from '../../../src/cli/render/transcript-record.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const OPTS: TranscriptRuntimeOptions = { stream: 'stdout', maxResultLines: 30 };

function capture(fn: () => void): string {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: unknown) => { chunks.push(String(chunk)); return true; });
  try { fn(); } finally { spy.mockRestore(); }
  return chunks.join('');
}

beforeEach(() => {
  clearTranscriptRecord();
  resetTranscriptTurnState();
});

describe('transcript renderer', () => {
  it('step separator writes a single divider line with one blank line above and below', () => {
    const expectedWidth = process.stdout.columns || TRANSCRIPT_DIVIDER_WIDTH;
    const output = capture(() => writeStepSeparator(OPTS));
    expect(stripAnsi(output)).toBe('\n' + '─'.repeat(expectedWidth) + '\n\n');
  });

  it('writeTranscriptText writes, drives the state machine, and records in one call', () => {
    const output = capture(() => {
      beginTranscriptTurn(OPTS);
      writeTranscriptText('hello\n');
      endTranscriptStep(false, OPTS);
    });
    expect(output).toBe('hello\n');

    const { entries } = getTranscriptRecord();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'turn', steps: [{ text: 'hello\n' }] });
  });

  it('writeTranscriptText ignores empty chunks so the record gains no empty steps', () => {
    capture(() => {
      beginTranscriptTurn(OPTS);
      writeTranscriptText('');
      endTranscriptStep(false, OPTS);
    });
    expect(getTranscriptRecord().entries).toHaveLength(0);
  });

  it('the first turn opens without a divider; the next one flushes the deferred separator', () => {
    const first = capture(() => {
      beginTranscriptTurn(OPTS);
      writeTranscriptText('one\n');
      endTranscriptStep(false, OPTS);
    });
    expect(first).toBe('one\n');

    const second = capture(() => {
      beginTranscriptTurn(OPTS);
      writeTranscriptText('two\n');
      endTranscriptStep(false, OPTS);
    });
    expect(stripAnsi(second)).toMatch(/^\n─+\n\ntwo\n$/);
  });

  it('resetTranscriptTurnState drops the deferred divider, and can put it back', () => {
    capture(() => {
      beginTranscriptTurn(OPTS);
      writeTranscriptText('one\n');
      endTranscriptStep(false, OPTS); // defers a divider
    });

    resetTranscriptTurnState();
    const afterReset = capture(() => {
      beginTranscriptTurn(OPTS);
      writeTranscriptText('two\n');
      endTranscriptStep(false, OPTS);
    });
    expect(afterReset).toBe('two\n');

    resetTranscriptTurnState(true);
    const afterRestore = capture(() => {
      beginTranscriptTurn(OPTS);
      writeTranscriptText('three\n');
      endTranscriptStep(false, OPTS);
    });
    expect(stripAnsi(afterRestore)).toMatch(/^\n─+\n\nthree\n$/);
  });
});
