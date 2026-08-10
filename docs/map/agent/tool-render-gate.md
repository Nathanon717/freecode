# src/agent/tool-render-gate.ts - Tool Render Gate

<!-- BEGIN GENERATED MAP INTENT -->
## Role

A one-slot rendezvous that keeps a tool's `execute` from drawing its call header until the native stream consumer has flushed the preceding response text. Fixes the ordering bug where a model's pre-tool preamble printed *after* the tool call (the AI SDK invokes `execute` before that text reaches the consumer).

## Read When

- Debugging transcript ordering between streamed text and tool calls.
- Changing how `loop.ts` consumes the native `fullStream`, or how `tools/index.ts` renders tool headers.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Arm the gate for one native `fullStream` consumption. Clears any stale state.
 */
beginToolRenderGate(): void

/**
 * Disarm the gate and release anything still waiting (end of stream or error).
 */
endToolRenderGate(): void

/**
 * Called by `execute` before it renders the tool-call header. Resolves immediately
 * when the gate is not armed (non-native paths) or a permit is already banked.
 * A lost release can never hang the agent: waiting is bounded by a safety timeout.
 */
awaitToolRenderGate(): Promise<void>

/**
 * Called by the consumer once it has processed (and flushed the text preceding) a
 * tool call's `tool-call` part, releasing the next waiting `execute`.
 */
releaseToolRenderGate(): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`agent/loop.ts`](loop.md) ×3, [`agent/tools/wrappers.ts`](tools/wrappers.md) ×1

## Tests

`tests/agent/tool-render-gate.test.ts`.

## Budget

80 / 500 lines (420 to spare).
<!-- END GENERATED MAP FACTS -->
