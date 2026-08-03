// check-tests: orphan — covers scripts/sweep/, which has no src/ mirror.
import { describe, it, expect } from 'vitest';
import { mapPool } from '../../scripts/sweep/pool.js';

describe('mapPool', () => {
  it('returns results in input order, not completion order', async () => {
    // Descending delays, so completion order is the exact reverse of input order.
    const items = [30, 20, 10, 0];
    const results = await mapPool(items, 4, async (ms, index) => {
      await new Promise(resolve => setTimeout(resolve, ms));
      return `${index}:${ms}`;
    });
    expect(results).toEqual(['0:30', '1:20', '2:10', '3:0']);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapPool(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 1));
      inFlight--;
    });
    expect(peak).toBe(3);
  });

  it('runs every item when there are fewer items than the limit', async () => {
    const seen: number[] = [];
    await mapPool([1, 2], 8, item => { seen.push(item); return Promise.resolve(); });
    expect(seen.sort()).toEqual([1, 2]);
  });

  it('handles an empty item list without hanging', async () => {
    expect(await mapPool([], 4, () => Promise.resolve('never'))).toEqual([]);
  });

  it('propagates a worker rejection', async () => {
    await expect(
      mapPool([1, 2, 3], 2, item => {
        if (item === 2) return Promise.reject(new Error('worker failed'));
        return Promise.resolve(item);
      }),
    ).rejects.toThrow('worker failed');
  });
});
