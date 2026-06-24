import type { RateLimitSnapshot } from '../quota/headers.js';

// Capture infrastructure shared by the OpenAI-compatible and Anthropic adapters.
// Both keep a per-provider store of the latest rate-limit header snapshot and
// accumulate per-turn usage-capture promises; only the payload shape differs.

/** Per-provider store of the most-recently captured rate-limit header snapshot. */
export class HeaderSnapshotStore {
  private snapshots = new Map<string, RateLimitSnapshot>();

  set(providerId: string, snapshot: RateLimitSnapshot): void {
    this.snapshots.set(providerId, snapshot);
  }

  get(providerId: string): RateLimitSnapshot | null {
    return this.snapshots.get(providerId) ?? null;
  }
}

/**
 * Per-provider accumulator of in-flight usage-capture promises. A capture
 * session is opened with begin() and drained with end(); pushes that happen
 * outside an open session are dropped. Capture errors resolve to null and are
 * filtered out by end().
 */
export class UsageCaptureStore<T> {
  private sessions = new Map<string, Promise<T | null>[]>();

  begin(providerId: string): void {
    this.sessions.set(providerId, []);
  }

  /** Enqueue a capture for the open session, if any. No-op when none is open. */
  push(providerId: string, capture: Promise<T | null>): void {
    // Attach the rejection guard before the session check so a capture pushed
    // outside a session can never surface as an unhandled rejection.
    const guarded = capture.catch(() => null);
    const session = this.sessions.get(providerId);
    if (!session) return;
    session.push(guarded);
  }

  async end(providerId: string): Promise<T[]> {
    const promises = this.sessions.get(providerId) ?? [];
    this.sessions.delete(providerId);
    // Cast away Awaited<T> unwrapping: captures resolve to T | null (T is a
    // plain usage record, never itself a promise).
    const results = (await Promise.all(promises)) as (T | null)[];
    return results.filter((value): value is T => value !== null);
  }
}
