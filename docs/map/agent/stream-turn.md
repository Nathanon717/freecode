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

interface RecoveringStreamOutcome<S extends RecoverableStream> {
  /** The attempt that drained without an error part. */
  stream: S;
  /**
   * Everything this turn added on top of `opts.messages`: the response messages
   * of every abandoned attempt, each followed by its rejection feedback, then
   * the winning attempt's own. Appending these to the caller's history yields
   * exactly the history a follow-up turn should continue from — which is why
   * they are also what the foreground loop persists into the session.
   *
   * Only ever collected from an attempt that drained, so every tool call in
   * here is paired with its result (see RecoverableStream.responseMessages).
   */
  turnMessages: CoreMessage[];
}

runRecoveringStream<S extends RecoverableStream>(opts: RecoveringStreamOptions<S>): Promise<RecoveringStreamOutcome<S>>
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

Resolves with a `RecoveringStreamOutcome`: the attempt that drained cleanly (typed as the caller's `S`, so the caller can still await that stream's `usage`) plus `turnMessages`.

## The turnMessages invariant

`turnMessages` is the turn's contribution to the session history — see [turn-messages.md](turn-messages.md) and [conversation.md](conversation.md). It is accumulated **here** rather than in `loop.ts` because this is where the correct cumulative history already gets built for the recovery path.

The load-bearing property: response messages are only ever collected from an attempt that **drained**, so every tool call in `turnMessages` is paired with its result. Do not add an await of `responseMessages` on a throwing path (the catch or abort handling in [loop.md](loop.md)) — an unpaired tool call persisted into history 400s the provider on every *later* request too, which bricks the session rather than spoiling one turn. Paths that throw should yield no `turnMessages`; the caller falls back to recording the final text alone.

`run-subagent.ts` discards the outcome entirely: a sub-agent's messages terminate at the sub-agent and must never reach the parent `Conversation`.

## Key neighbors

- [loop.md](loop.md) — foreground caller; supplies rendering and usage-carrying callbacks.
- [subagents/run-subagent.md](subagents/run-subagent.md) — silent caller; supplies only text accumulation.
- [../util/errors.md](../util/errors.md) — `rejectedToolCall`, `MAX_REJECTED_TOOL_CALLS`.

## Update triggers

- A new caller needs a hook the callback set does not cover.
- The recovery cap or the continuation-message shape changes.
