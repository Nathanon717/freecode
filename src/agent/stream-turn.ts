// Drives one logical model turn as a sequence of streamText attempts, recovering
// from tool calls the SDK rejected before execution.
//
// `fullStream` reports such a rejection as an `error` part rather than throwing,
// so an unread error part silently truncates the turn. Recovery is always the
// same three moves: keep what actually ran (`responseMessages`), append the
// rejection feedback as a user message, re-open the stream — capped by
// MAX_REJECTED_TOOL_CALLS. Both the foreground loop (agent/loop.ts) and the
// sub-agent runner (agent/subagents/run-subagent.ts) need exactly that and differ
// only in what they do with the parts, so the differences are callbacks.

import type { CoreMessage } from 'ai';
import { MAX_REJECTED_TOOL_CALLS, rejectedToolCall, serializeError, type RejectedToolCall } from '../util/errors.js';
import { log } from '../logger.js';

export type StreamPart = { type: string } & Record<string, unknown>;

/** The slice of a `streamText` result this driver needs. */
export interface RecoverableStream {
  fullStream: AsyncIterable<StreamPart>;
  // Resolved even when a step ended on an error part, and it holds only calls
  // that actually ran, each paired with its result — a rejected call never
  // reaches the stream. That makes it the history to continue the turn from.
  responseMessages: Promise<CoreMessage[]>;
}

export interface RecoveringStreamOptions<S extends RecoverableStream> {
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

export interface RecoveringStreamOutcome<S extends RecoverableStream> {
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

/** Resolves with the attempt that drained without an error part. */
export async function runRecoveringStream<S extends RecoverableStream>(
  opts: RecoveringStreamOptions<S>,
): Promise<RecoveringStreamOutcome<S>> {
  let activeMessages = opts.messages;
  let recoveries = 0;
  const carried: CoreMessage[] = [];

  while (true) {
    const stream = await opts.start(activeMessages);
    let streamError: unknown;
    let streamHadError = false;

    try {
      for await (const part of stream.fullStream) {
        if (part.type !== 'error') {
          opts.onPart(part);
          continue;
        }
        streamError = part.error;
        streamHadError = true;
        const rejected = rejectedToolCall(part.error);
        if (rejected) opts.onRejected?.(rejected, part.error);
      }
    } finally {
      opts.onDrained?.();
    }

    if (!streamHadError) return { stream, turnMessages: [...carried, ...(await stream.responseMessages)] };

    const rejected = rejectedToolCall(streamError);
    if (!rejected || recoveries >= MAX_REJECTED_TOOL_CALLS) throw streamError;
    recoveries++;
    log('stream', `${opts.logPrefix ?? ''}Tool call rejected before execution; feeding the error back and continuing the turn`, {
      tool: rejected.name,
      error: serializeError(streamError),
    });
    await opts.onRecover?.(stream);
    const recovered: CoreMessage[] = [...(await stream.responseMessages), { role: 'user' as const, content: rejected.feedback }];
    carried.push(...recovered);
    activeMessages = [...activeMessages, ...recovered];
  }
}
