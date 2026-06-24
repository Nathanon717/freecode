import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createStdoutRetrySink } from '../../src/cli/stdout-retry-sink.js';

let writes: string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  writes = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('createStdoutRetrySink', () => {
  it('writes an initial countdown line from the target time', () => {
    const sink = createStdoutRetrySink();
    sink({ name: 'Groq', label: 'rate-limited', targetMs: 3000 });
    expect(writes.join('')).toContain('Groq rate-limited — retrying in 3s...');
  });

  it('ticks the countdown down each second', () => {
    const sink = createStdoutRetrySink();
    sink({ name: 'Groq', label: 'rate-limited', targetMs: 3000 });
    vi.advanceTimersByTime(1000);
    expect(writes.join('')).toContain('retrying in 2s...');
    vi.advanceTimersByTime(2000);
    expect(writes.join('')).toContain('retrying now...');
  });

  it('stops writing after a null call clears the interval', () => {
    const sink = createStdoutRetrySink();
    sink({ name: 'Groq', label: 'rate-limited', targetMs: 5000 });
    sink(null);
    const countBefore = writes.length;
    vi.advanceTimersByTime(5000);
    expect(writes.length).toBe(countBefore);
  });

  it('does not leak a prior interval when a new countdown starts', () => {
    const sink = createStdoutRetrySink();
    sink({ name: 'A', label: 'rate-limited', targetMs: 10_000 });
    sink({ name: 'B', label: 'rate-limited', targetMs: 2000 });
    vi.advanceTimersByTime(1000);
    // Only the second countdown should still be ticking.
    const joined = writes.join('');
    expect(joined).toContain('B rate-limited — retrying in 1s...');
    expect(joined).not.toContain('A rate-limited — retrying in 9s...');
  });
});
