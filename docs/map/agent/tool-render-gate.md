# src/agent/tool-render-gate.ts - Tool Render Gate

**Role:** A one-slot rendezvous that keeps a tool's `execute` from drawing its call header until the native stream consumer has flushed the preceding response text. Fixes the ordering bug where a model's pre-tool preamble printed *after* the tool call (the AI SDK invokes `execute` before that text reaches the consumer).

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
beginToolRenderGate(): void

endToolRenderGate(): void

awaitToolRenderGate(): Promise<void>

releaseToolRenderGate(): void
```
<!-- END GENERATED EXPORTS -->

## Export notes

- Correlates by order, not id: the AI SDK (v3.4) passes no tool-call id to `execute`. Because `execute` runs are serialized (`tools/index.ts` `withSerializedExecution`) and `fullStream` emits `tool-call` parts in the same order, a plain counting semaphore pairs the Nth `execute` with the Nth part. Permits granted before their `execute` arrives are banked (parallel calls emit all parts up front).
- `beginToolRenderGate()` / `endToolRenderGate()` — arm/disarm around one native `fullStream` consumption; `end` releases anything still waiting. Only `loop.ts` `streamWithRetry` arms it.
- `awaitToolRenderGate()` — called by `withLogging.execute` before the header; a no-op when unarmed (prompt-tools, fake-direct, `/renderer`) or when a permit is banked. Has a safety timeout so a lost release can never hang the agent.
- `releaseToolRenderGate()` — called by the consumer on each `tool-call` part, after flushing that step's pending text.

## Read When

- Debugging transcript ordering between streamed text and tool calls.
- Changing how `loop.ts` consumes the native `fullStream`, or how `tools/index.ts` renders tool headers.

## Key Neighbors

- [`loop.ts`](loop.md) — arms the gate and releases it from the `fullStream` consumer.
- [`tools/index.ts`](tools/index.md) — `withLogging.execute` awaits the gate before the header.
- [`../cli/transcript-renderer.md`](../cli/transcript-renderer.md) — the header/preview/divider writers being ordered.
