# src/agent/stream-turn.ts - Recovering Stream Turn

**Role:** Drives one logical model turn as a sequence of `streamText` attempts, recovering from tool calls the SDK rejected before execution. The shared core behind both the foreground loop and the sub-agent runner.

**Read when:** changing how a rejected tool call is fed back to the model, how many recovery attempts a turn gets, or how a caller hooks into stream parts.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type StreamPart = { type: string } & Record<string, unknown>;

interface RecoverableStream {
  fullStream: AsyncIterable<StreamPart>;
  // Resolved even when a step ended on an error part, and it holds only calls
  // that actually ran, each paired with its result — a rejected call never
  // reaches the stream. That makes it the history to continue the turn from.
  responseMessages: Promise<CoreMessage[]>;
}

interface RecoveringStreamOptions<S extends RecoverableStream> {
  messages: CoreMessage[];
  /** Opens one attempt over the given history. Per-attempt setup belongs here. */
  start: (messages: CoreMessage[]) => Promise<S>;
  /** Receives every part in stream order except `error` parts. */
  onPart: (part: StreamPart) => void;
  /**
   * Called when an error part carries a rejected call, while the step is still
   * open, so the caller can render it in place. Fires whether or not the retry
   * budget still allows recovery.
   */
  onRejected?: (rejected: RejectedToolCall, error: unknown) => void;
  /** Runs after each attempt's drain, on success and failure alike. */
  onDrained?: () => void;
  /** Runs before a retry, e.g. to carry the abandoned attempt's usage forward. */
  onRecover?: (stream: S) => Promise<void>;
  /** Prefix for this driver's log lines, e.g. `"spawn_agent: "`. */
  logPrefix?: string;
}

runRecoveringStream<S extends RecoverableStream>(opts: RecoveringStreamOptions<S>): Promise<S>
```
<!-- END GENERATED EXPORTS -->

## Why it exists

`fullStream` reports a pre-execution tool rejection as an `error` part rather than throwing, so an unread error part silently truncates the turn. Recovery is always the same three moves — keep what actually ran (`responseMessages`), append `rejected.feedback` as a user message, re-open the stream — capped by `MAX_REJECTED_TOOL_CALLS` from [util/errors.md](../util/errors.md). [loop.md](loop.md) and [subagents/run-subagent.md](subagents/run-subagent.md) both need exactly that and differ only in what they do with the parts, so the differences are callbacks.

## Callback contract

- `start(messages)` — opens one attempt. **Per-attempt setup belongs here** (fresh markdown renderer, transcript turn, render gate, counter resets); it is called again for every recovery.
- `onPart` — every part in stream order **except** `error` parts, which the driver owns.
- `onRejected(rejected, error)` — fires while the step is still open, so a caller can render the rejected call in place. Fires whether or not the retry budget still allows recovery.
- `onDrained` — after each attempt's drain, success or failure; pair it with anything `start` opened (the tool-render gate).
- `onRecover(stream)` — before a retry, for carrying the abandoned attempt's usage forward.

Resolves with the attempt that drained cleanly, typed as the caller's `S`, so the caller can still await that stream's `usage`.

## Key neighbors

- [loop.md](loop.md) — foreground caller; supplies rendering and usage-carrying callbacks.
- [subagents/run-subagent.md](subagents/run-subagent.md) — silent caller; supplies only text accumulation.
- [../util/errors.md](../util/errors.md) — `rejectedToolCall`, `MAX_REJECTED_TOOL_CALLS`.

## Update triggers

- A new caller needs a hook the callback set does not cover.
- The recovery cap or the continuation-message shape changes.
