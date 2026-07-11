// Rendezvous between the native `fullStream` consumer (agent/loop.ts) and a tool's
// `execute` (agent/tools/index.ts withLogging).
//
// The AI SDK invokes a tool's `execute` as soon as it assembles the tool call —
// empirically before the pre-tool "preamble" text-delta reaches the stream
// consumer. `execute` renders the tool-call header as a side effect, so without
// coordination the header prints before the preamble it was supposed to follow
// (see docs/bug log — "preamble printed in the wrong place").
//
// `fullStream` delivers parts in true provider order (text-delta… → tool-call →
// tool-result), so the consumer holds `execute` at the header until it has
// processed that call's `tool-call` part (having flushed all preceding text).
//
// The AI SDK (v3.4) does not pass a tool-call id to `execute`, so this can't
// correlate by id. It doesn't need to: `execute` runs are fully serialized
// (withSerializedExecution) and the consumer emits `tool-call` parts in the same
// order, so a plain counting semaphore pairs the Nth `execute` with the Nth part.
// A permit granted before its `execute` arrives is banked (parallel tool calls in
// one step emit all their parts up front); an `execute` that arrives first waits.
//
// The gate is a no-op unless a native stream has armed it, so the prompt-tools
// loop, the fake-direct loop, and the /renderer demo — which render tool steps
// synchronously and never emit a `tool-call` part — are unaffected.

// Safety net: if the consumer never releases (e.g. the stream errored between
// assembling a call and delivering its part), `execute` proceeds rather than
// hanging the agent. Normal release happens within milliseconds.
const GATE_TIMEOUT_MS = 4000;

let active = false;
let permits = 0;
const waiters: Array<() => void> = [];

/** Arm the gate for one native `fullStream` consumption. Clears any stale state. */
export function beginToolRenderGate(): void {
  active = true;
  permits = 0;
  waiters.length = 0;
}

/** Disarm the gate and release anything still waiting (end of stream or error). */
export function endToolRenderGate(): void {
  active = false;
  permits = 0;
  while (waiters.length) waiters.shift()!();
}

/**
 * Called by `execute` before it renders the tool-call header. Resolves immediately
 * when the gate is not armed (non-native paths) or a permit is already banked.
 */
export async function awaitToolRenderGate(): Promise<void> {
  if (!active) return;
  if (permits > 0) {
    permits--;
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  await new Promise<void>((resolve) => {
    waiters.push(resolve);
    timer = setTimeout(() => {
      const i = waiters.indexOf(resolve);
      if (i !== -1) waiters.splice(i, 1);
      resolve();
    }, GATE_TIMEOUT_MS);
  });
  if (timer) clearTimeout(timer);
}

/**
 * Called by the consumer once it has processed (and flushed the text preceding) a
 * tool call's `tool-call` part, releasing the next waiting `execute`.
 */
export function releaseToolRenderGate(): void {
  if (!active) return;
  const next = waiters.shift();
  if (next) next();
  else permits++;
}
