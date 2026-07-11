import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  awaitToolRenderGate,
  beginToolRenderGate,
  endToolRenderGate,
  releaseToolRenderGate,
} from '../../src/agent/tool-render-gate.js';

// Resolves on the next macrotask so we can assert whether a pending await has
// settled without racing its microtask.
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const settled = async (p: Promise<void>): Promise<boolean> => {
  let done = false;
  void p.then(() => {
    done = true;
  });
  await tick();
  return done;
};

describe('tool render gate', () => {
  afterEach(() => {
    endToolRenderGate();
    vi.useRealTimers();
  });

  it('is a no-op when not armed', async () => {
    expect(await settled(awaitToolRenderGate())).toBe(true);
  });

  it('blocks execute until the consumer releases', async () => {
    beginToolRenderGate();
    const p = awaitToolRenderGate();
    expect(await settled(p)).toBe(false); // still waiting
    releaseToolRenderGate();
    expect(await settled(p)).toBe(true); // released
  });

  it('banks a permit when the consumer releases first', async () => {
    beginToolRenderGate();
    releaseToolRenderGate(); // part arrived before its execute
    expect(await settled(awaitToolRenderGate())).toBe(true); // consumes banked permit
    // The banked permit is single-use: a second await now blocks.
    expect(await settled(awaitToolRenderGate())).toBe(false);
  });

  it('pairs releases to waiters in FIFO order', async () => {
    beginToolRenderGate();
    const order: number[] = [];
    const first = awaitToolRenderGate().then(() => order.push(1));
    const second = awaitToolRenderGate().then(() => order.push(2));
    releaseToolRenderGate();
    await first;
    expect(order).toEqual([1]); // only the first waiter released
    releaseToolRenderGate();
    await second;
    expect(order).toEqual([1, 2]);
  });

  it('releases everything still waiting when the gate ends', async () => {
    beginToolRenderGate();
    const p = awaitToolRenderGate();
    expect(await settled(p)).toBe(false);
    endToolRenderGate();
    expect(await settled(p)).toBe(true);
  });

  it('never hangs: a lost release resolves via the safety timeout', async () => {
    vi.useFakeTimers();
    beginToolRenderGate();
    let done = false;
    void awaitToolRenderGate().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(done).toBe(true);
  });
});
