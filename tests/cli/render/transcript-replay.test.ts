import type { CoreMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { stripAnsi } from '../../../src/util/screen-buffer.js';
import { replayTranscript } from '../../../src/cli/render/transcript-replay.js';

function replay(messages: CoreMessage[]): string {
  let out = '';
  replayTranscript(messages, (s) => { out += s; });
  return stripAnsi(out);
}

describe('replayTranscript', () => {
  it('prints nothing for empty history, so /clear still lands on a bare banner', () => {
    expect(replay([])).toBe('');
  });

  it('replays user and assistant turns', () => {
    const out = replay([
      { role: 'user', content: 'what is 2+2' },
      { role: 'assistant', content: '4' },
    ]);
    expect(out).toContain('what is 2+2');
    expect(out).toContain('4');
  });

  it('states the true total so the screen never claims less than is sent', () => {
    const out = replay([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
    expect(out).toContain('2 messages');
    expect(out).toContain('still sent to the model');
  });

  it('renders one line per tool call', () => {
    const out = replay([
      { role: 'user', content: 'read it' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'looking now' },
          { type: 'tool-call', toolCallId: 'c1', toolName: 'read', args: { path: 'a.ts' } },
        ],
      },
    ]);
    expect(out).toContain('looking now');
    expect(out).toContain('read(a.ts)');
  });

  it('omits tool result bodies — they are the bulk of a turn', () => {
    const out = replay([
      { role: 'user', content: 'read it' },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'read', result: 'SECRET-BODY' }] },
    ]);
    expect(out).not.toContain('SECRET-BODY');
  });

  it('tail-shows a long history under a count of what is hidden', () => {
    const messages: CoreMessage[] = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i}`,
    }));
    const out = replay(messages);
    expect(out).toContain('50 messages');
    expect(out).toContain('10 earlier messages not shown');
    expect(out).not.toContain('msg-0\n');
    expect(out).toContain('msg-49');
  });

  it('singularizes a one-message history', () => {
    const out = replay([{ role: 'user', content: 'hi' }]);
    expect(out).toContain('1 message,');
  });
});
