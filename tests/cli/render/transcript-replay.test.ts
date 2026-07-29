import type { CoreMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stripAnsi } from '../../../src/util/screen-buffer.js';
import { replayTranscript } from '../../../src/cli/render/transcript-replay.js';
import {
  clearTranscriptRecord,
  recordTranscriptPrompt,
} from '../../../src/cli/render/transcript-record.js';
import {
  beginTranscriptTurn,
  endTranscriptStep,
  resetTranscriptTurnState,
  writeToolCallHeader,
  writeToolStepResult,
  writeTranscriptText,
  type TranscriptRuntimeOptions,
} from '../../../src/cli/render/transcript-renderer.js';

const OPTS: TranscriptRuntimeOptions = { stream: 'stdout', maxResultLines: 30 };

/** Everything written to stdout while `fn` runs — the live paint, or the replay of it. */
function capture(fn: () => void): string {
  const chunks: string[] = [];
  const spy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: unknown) => { chunks.push(String(chunk)); return true; });
  try { fn(); } finally { spy.mockRestore(); }
  return chunks.join('');
}

/** The replay minus its framing header, which is the one thing the live paint lacks. */
function bodyOf(replayed: string): string {
  const blank = replayed.indexOf('\n\n');
  return blank === -1 ? replayed : replayed.slice(blank + 2);
}

const messages: CoreMessage[] = [
  { role: 'user', content: 'read it' },
  { role: 'assistant', content: 'done' },
];

beforeEach(() => {
  clearTranscriptRecord();
  resetTranscriptTurnState();
});

describe('replayTranscript', () => {
  it('prints nothing for an empty record, so /clear still lands on a bare banner', () => {
    expect(capture(() => replayTranscript([], OPTS))).toBe('');
    expect(capture(() => replayTranscript(messages, OPTS))).toBe('');
  });

  it('reproduces the live paint exactly — text, divider spacing and result preview', () => {
    const live = capture(() => {
      beginTranscriptTurn(OPTS);
      writeTranscriptText('Reading the file now.\n');
      writeToolCallHeader({ name: 'read', displayArgs: { path: 'a.ts' } }, OPTS);
      writeToolStepResult('read', { kind: 'text', result: 'line one\nline two' }, OPTS);
      endTranscriptStep(false, OPTS);
    });

    resetTranscriptTurnState();
    const replayed = capture(() => replayTranscript(messages, OPTS));

    expect(bodyOf(replayed)).toBe(live);
    expect(stripAnsi(live)).toContain('read(a.ts)');
    expect(stripAnsi(live)).toContain('line two');
  });

  it('replays an edit as its diff — the thing a replay driven by history cannot do', () => {
    const live = capture(() => {
      beginTranscriptTurn(OPTS);
      writeToolCallHeader({ name: 'edit', displayArgs: { path: 'a.ts' } }, OPTS);
      writeToolStepResult('edit', {
        kind: 'edit-diff',
        path: 'a.ts',
        oldText: 'const a = 1;',
        newText: 'const a = 2;',
        contextBefore: [],
        contextAfter: [],
        lineIndent: '',
        startLine: 1,
      }, OPTS);
      endTranscriptStep(false, OPTS);
    });

    resetTranscriptTurnState();
    const replayed = capture(() => replayTranscript(messages, OPTS));

    expect(bodyOf(replayed)).toBe(live);
    expect(stripAnsi(live)).toContain('-const a = 1;');
    expect(stripAnsi(replayed)).toContain('+const a = 2;');
  });

  it('replays a long result with the same truncation footer, not the whole body', () => {
    const result = Array.from({ length: 100 }, (_, i) => `line-${i}`).join('\n');
    const live = capture(() => {
      beginTranscriptTurn(OPTS);
      writeToolCallHeader({ name: 'read', displayArgs: { path: 'big.ts' } }, OPTS);
      writeToolStepResult('read', { kind: 'text', result }, OPTS);
      endTranscriptStep(false, OPTS);
    });

    resetTranscriptTurnState();
    const replayed = capture(() => replayTranscript(messages, OPTS));

    expect(bodyOf(replayed)).toBe(live);
    expect(stripAnsi(replayed)).toContain('... (70 more lines)');
    expect(stripAnsi(replayed)).not.toContain('line-99');
  });

  it('replays submitted prompts with the same "> " echo the input UI printed', () => {
    recordTranscriptPrompt('read it');
    const out = stripAnsi(capture(() => replayTranscript(messages, OPTS)));
    expect(out).toContain('> read it');
  });

  it('indents continuation lines of a multi-line prompt, as the input UI does', () => {
    recordTranscriptPrompt('first\nsecond');
    const out = stripAnsi(capture(() => replayTranscript(messages, OPTS)));
    expect(out).toContain('> first\n  second');
  });

  it('states the true history total so the screen never claims less than is sent', () => {
    recordTranscriptPrompt('hi');
    const out = stripAnsi(capture(() => replayTranscript(messages, OPTS)));
    expect(out).toContain('2 messages');
    expect(out).toContain('still sent to the model');
  });

  it('singularizes a one-message history', () => {
    recordTranscriptPrompt('hi');
    const out = stripAnsi(capture(() => replayTranscript([messages[0]], OPTS)));
    expect(out).toContain('1 message,');
  });

  it('does not record its own output — replaying twice does not double the transcript', () => {
    recordTranscriptPrompt('read it');
    capture(() => replayTranscript(messages, OPTS));
    resetTranscriptTurnState();
    const second = stripAnsi(capture(() => replayTranscript(messages, OPTS)));
    expect(second.match(/> read it/g)).toHaveLength(1);
  });

  it('separates replayed turns with the same divider that separated them live', () => {
    const live = capture(() => {
      recordTranscriptPrompt('one');
      beginTranscriptTurn(OPTS);
      writeTranscriptText('first answer\n');
      endTranscriptStep(false, OPTS);
      recordTranscriptPrompt('two');
      beginTranscriptTurn(OPTS);
      writeTranscriptText('second answer\n');
      endTranscriptStep(false, OPTS);
    });

    resetTranscriptTurnState();
    const replayed = stripAnsi(capture(() => replayTranscript(messages, OPTS)));

    // The divider belongs between the second prompt and the turn it opened,
    // exactly where the live paint flushed it.
    expect(stripAnsi(live)).toContain('first answer');
    expect(replayed).toMatch(/first answer[\s\S]*> two\n\n─+\n\nsecond answer/);
  });
});
