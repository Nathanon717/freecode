import { describe, expect, it, vi } from 'vitest';
import type { CoreMessage } from 'ai';
import { NoSuchToolError } from 'ai';
import { runRecoveringStream, type RecoverableStream, type StreamPart } from '../../src/agent/stream-turn.js';
import { MAX_REJECTED_TOOL_CALLS } from '../../src/util/errors.js';

async function* replay(parts: StreamPart[]): AsyncGenerator<StreamPart> {
  for (const part of parts) yield await Promise.resolve(part);
}

/** A stand-in for a streamText result: replays `parts`, then resolves the history. */
function fakeStream(parts: StreamPart[], responseMessages: CoreMessage[] = []): RecoverableStream {
  return { fullStream: replay(parts), responseMessages: Promise.resolve(responseMessages) };
}

const rejection = (): unknown =>
  new NoSuchToolError({ toolName: 'repo_browser.grep', availableTools: ['grep'] });

describe('runRecoveringStream', () => {
  it('returns the stream and forwards every non-error part in order', async () => {
    const seen: string[] = [];
    const stream = fakeStream([
      { type: 'text-delta', textDelta: 'hi' },
      { type: 'tool-call' },
      { type: 'step-finish' },
    ]);

    const result = await runRecoveringStream({
      messages: [{ role: 'user', content: 'go' }],
      start: () => Promise.resolve(stream),
      onPart: (part) => seen.push(part.type),
    });

    expect(seen).toEqual(['text-delta', 'tool-call', 'step-finish']);
    expect(result).toBe(stream);
  });

  it('re-opens the stream after a rejected call, continuing from what actually ran', async () => {
    const ran: CoreMessage[] = [{ role: 'assistant', content: 'partial work' }];
    const histories: CoreMessage[][] = [];
    let attempt = 0;

    await runRecoveringStream({
      messages: [{ role: 'user', content: 'go' }],
      start: (messages) => {
        histories.push(messages);
        attempt++;
        return Promise.resolve(
          attempt === 1
            ? fakeStream([{ type: 'error', error: rejection() }], ran)
            : fakeStream([{ type: 'text-delta', textDelta: 'done' }]),
        );
      },
      onPart: () => {},
    });

    expect(attempt).toBe(2);
    // Second attempt = original history + what ran + the rejection feedback.
    expect(histories[1]).toHaveLength(3);
    expect(histories[1][1]).toEqual(ran[0]);
    expect(histories[1][2].role).toBe('user');
    expect(histories[1][2].content).toContain('was rejected');
  });

  it('reports the rejection while the step is still open, then carries usage forward', async () => {
    const order: string[] = [];
    let attempt = 0;

    await runRecoveringStream({
      messages: [],
      start: () => {
        order.push('start');
        attempt++;
        return Promise.resolve(
          attempt === 1 ? fakeStream([{ type: 'error', error: rejection() }]) : fakeStream([]),
        );
      },
      onPart: () => {},
      onRejected: (rejected) => order.push(`rejected:${rejected.name}`),
      onDrained: () => order.push('drained'),
      onRecover: () => {
        order.push('recover');
        return Promise.resolve();
      },
    });

    // onRejected fires inside the drain; onDrained closes the attempt; onRecover
    // runs before the next start, so a caller can bank the abandoned usage.
    expect(order).toEqual([
      'start',
      'rejected:repo_browser.grep',
      'drained',
      'recover',
      'start',
      'drained',
    ]);
  });

  it('drains every attempt even when the error is not recoverable', async () => {
    const boom = new Error('provider exploded');
    const onDrained = vi.fn();

    await expect(
      runRecoveringStream({
        messages: [],
        start: () => Promise.resolve(fakeStream([{ type: 'error', error: boom }])),
        onPart: () => {},
        onDrained,
      }),
    ).rejects.toBe(boom);

    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it('throws the rejection once the recovery budget is spent', async () => {
    let attempts = 0;
    const error = rejection();

    await expect(
      runRecoveringStream({
        messages: [],
        start: () => {
          attempts++;
          return Promise.resolve(fakeStream([{ type: 'error', error }]));
        },
        onPart: () => {},
      }),
    ).rejects.toBe(error);

    // One initial attempt plus MAX_REJECTED_TOOL_CALLS recoveries.
    expect(attempts).toBe(MAX_REJECTED_TOOL_CALLS + 1);
  });
});
