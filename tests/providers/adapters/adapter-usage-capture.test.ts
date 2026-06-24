import { describe, it, expect } from 'vitest';
import { HeaderSnapshotStore, UsageCaptureStore } from '../../../src/providers/adapters/adapter-usage-capture.js';
import type { RateLimitSnapshot } from '../../../src/providers/quota/headers.js';

describe('HeaderSnapshotStore', () => {
  it('returns null before anything is stored', () => {
    const store = new HeaderSnapshotStore();
    expect(store.get('groq')).toBeNull();
  });

  it('stores and retrieves the latest snapshot per provider', () => {
    const store = new HeaderSnapshotStore();
    const snap: RateLimitSnapshot = [{ label: 'R', limit: 10, remaining: 9, resetMs: 1000 }];
    store.set('groq', snap);
    expect(store.get('groq')).toBe(snap);
    expect(store.get('mistral')).toBeNull();
  });
});

describe('UsageCaptureStore', () => {
  it('drops pushes when no session is open', async () => {
    const store = new UsageCaptureStore<number>();
    store.push('p', Promise.resolve(1));
    // No begin() called, so end() yields nothing.
    expect(await store.end('p')).toEqual([]);
  });

  it('guards rejected pushes made outside a session (no unhandled rejection)', async () => {
    const store = new UsageCaptureStore<number>();
    // No begin(): the promise is dropped, but its rejection must still be
    // swallowed so it cannot surface as an unhandled rejection.
    store.push('p', Promise.reject(new Error('boom')));
    await Promise.resolve();
    expect(await store.end('p')).toEqual([]);
  });

  it('collects non-null captures within a session', async () => {
    const store = new UsageCaptureStore<number>();
    store.begin('p');
    store.push('p', Promise.resolve(1));
    store.push('p', Promise.resolve(null));
    store.push('p', Promise.resolve(2));
    expect(await store.end('p')).toEqual([1, 2]);
  });

  it('treats rejected captures as null', async () => {
    const store = new UsageCaptureStore<number>();
    store.begin('p');
    store.push('p', Promise.reject(new Error('boom')));
    store.push('p', Promise.resolve(5));
    expect(await store.end('p')).toEqual([5]);
  });

  it('ends a session so a subsequent end yields nothing', async () => {
    const store = new UsageCaptureStore<number>();
    store.begin('p');
    store.push('p', Promise.resolve(1));
    expect(await store.end('p')).toEqual([1]);
    expect(await store.end('p')).toEqual([]);
  });

  it('keeps sessions independent per provider', async () => {
    const store = new UsageCaptureStore<number>();
    store.begin('a');
    store.begin('b');
    store.push('a', Promise.resolve(1));
    store.push('b', Promise.resolve(2));
    expect(await store.end('a')).toEqual([1]);
    expect(await store.end('b')).toEqual([2]);
  });
});
