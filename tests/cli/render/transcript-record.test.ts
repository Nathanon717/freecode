import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTranscriptRecord,
  getTranscriptRecord,
  recordTranscriptPrompt,
  recordTranscriptStepEnd,
  recordTranscriptText,
  recordTranscriptToolCall,
  recordTranscriptToolResult,
  setTranscriptRecording,
} from '../../../src/cli/render/transcript-record.js';

beforeEach(() => {
  clearTranscriptRecord();
  setTranscriptRecording(true);
});

describe('transcript record', () => {
  it('groups a prompt and the turn that answered it into separate entries', () => {
    recordTranscriptPrompt('read it');
    recordTranscriptText('on it\n');
    recordTranscriptStepEnd(false);

    const { entries } = getTranscriptRecord();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: 'prompt', text: 'read it' });
    expect(entries[1]).toMatchObject({ kind: 'turn', steps: [{ text: 'on it\n' }] });
  });

  it('accumulates streamed chunks into one step, as they appeared on screen', () => {
    recordTranscriptText('Hel');
    recordTranscriptText('lo\n');
    recordTranscriptStepEnd(false);

    const [turn] = getTranscriptRecord().entries;
    expect(turn).toMatchObject({ kind: 'turn', steps: [{ text: 'Hello\n' }] });
  });

  it('keeps a multi-step turn as one entry, so its dividers replay as one turn', () => {
    recordTranscriptText('step one\n');
    recordTranscriptStepEnd(true);
    recordTranscriptText('step two\n');
    recordTranscriptStepEnd(false);

    const { entries } = getTranscriptRecord();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'turn',
      steps: [{ text: 'step one\n' }, { text: 'step two\n' }],
    });
  });

  it('attaches a result to the call it belongs to', () => {
    recordTranscriptToolCall({ name: 'read', displayArgs: { path: 'a.ts' } });
    recordTranscriptToolResult({ kind: 'preformatted', text: '  body' });
    recordTranscriptStepEnd(false);

    const [turn] = getTranscriptRecord().entries;
    expect(turn).toMatchObject({
      kind: 'turn',
      steps: [{ tools: [{ name: 'read', result: { kind: 'preformatted', text: '  body' } }] }],
    });
  });

  it('lets the post-execution result overwrite the pre-approval preview', () => {
    recordTranscriptToolCall({ name: 'read', displayArgs: { path: 'a.ts' } });
    recordTranscriptToolResult({ kind: 'preformatted', text: 'preview' });
    recordTranscriptToolResult({ kind: 'preformatted', text: 'final' });
    recordTranscriptStepEnd(false);

    const [turn] = getTranscriptRecord().entries;
    expect(turn).toMatchObject({
      kind: 'turn',
      steps: [{ tools: [{ result: { kind: 'preformatted', text: 'final' } }] }],
    });
  });

  it('drops a result with no call open rather than inventing a tool step', () => {
    recordTranscriptToolResult({ kind: 'preformatted', text: 'orphan' });
    expect(getTranscriptRecord().entries).toHaveLength(0);
  });

  it('closes a turn left open by an error path when the next prompt arrives', () => {
    recordTranscriptText('half an answer\n'); // no step end — the turn threw
    recordTranscriptPrompt('try again');
    recordTranscriptText('second answer\n');
    recordTranscriptStepEnd(false);

    const { entries } = getTranscriptRecord();
    expect(entries.map((e) => e.kind)).toEqual(['turn', 'prompt', 'turn']);
  });

  it('records nothing while suspended, so a replay does not append itself', () => {
    setTranscriptRecording(false);
    recordTranscriptPrompt('hi');
    recordTranscriptText('there\n');
    recordTranscriptStepEnd(false);
    expect(getTranscriptRecord().entries).toHaveLength(0);

    setTranscriptRecording(true);
    recordTranscriptPrompt('hi');
    expect(getTranscriptRecord().entries).toHaveLength(1);
  });

  it('evicts oldest entries past the size cap and counts what it dropped', () => {
    const big = 'x'.repeat(50_000);
    for (let i = 0; i < 8; i++) {
      recordTranscriptText(big);
      recordTranscriptStepEnd(false);
    }

    const { entries, dropped } = getTranscriptRecord();
    expect(dropped).toBeGreaterThan(0);
    expect(entries.length + dropped).toBe(8);
    // The cap is a bound on what is kept, not a promise to keep everything.
    expect(entries.length).toBeLessThan(8);
  });

  it('never evicts the turn still being written', () => {
    const big = 'x'.repeat(50_000);
    for (let i = 0; i < 6; i++) {
      recordTranscriptText(big);
      recordTranscriptStepEnd(false);
    }
    // An open turn that alone exceeds the cap must still be the last entry.
    for (let i = 0; i < 8; i++) recordTranscriptText(big);

    const { entries } = getTranscriptRecord();
    const last = entries[entries.length - 1];
    expect(last.kind).toBe('turn');
    expect(last.kind === 'turn' && last.steps[0].text).toBe(big.repeat(8));
  });

  it('clearTranscriptRecord resets the dropped count too', () => {
    const big = 'x'.repeat(300_000);
    recordTranscriptText(big);
    recordTranscriptStepEnd(false);
    recordTranscriptText('after');
    recordTranscriptStepEnd(false);
    expect(getTranscriptRecord().dropped).toBeGreaterThan(0);

    clearTranscriptRecord();
    expect(getTranscriptRecord()).toEqual({ entries: [], dropped: 0 });
  });
});
