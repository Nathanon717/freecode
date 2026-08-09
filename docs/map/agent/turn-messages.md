# src/agent/turn-messages.ts - Turn Message Shape Rules

## Why it exists

Two tool protocols write into the same `Conversation`:

- the **native** path emits real `tool-call` parts on an assistant message plus a
  `role: 'tool'` message of matching `tool-result` parts;
- the **parsed-tools** and **fake** paths emit the text protocol — a plain
  assistant message and a plain user message of `<tool_result>` blocks.

Text-protocol messages are accepted everywhere and need no translation. Native
tool messages are the constrained direction, and every export below exists for
them.

## Export notes

- `dropUnpairedToolCalls` is a **guard rail, not the mechanism**. A tool call
  persisted without its result 400s the provider on every *later* request too —
  the one failure mode that bricks a session rather than spoiling a turn. The
  real invariant lives in [stream-turn.md](stream-turn.md): `runRecoveringStream`
  only collects response messages from an attempt that **drained**, and those are
  already balanced. If this function ever drops something, that invariant broke
  upstream — hence the log line. Do not grow it into an elaborate repair pass.
- `pairStoppedToolCalls` is the **one** sanctioned repair, and it exists because
  a turn stopped by Esc breaks that invariant on purpose. `withTurnStop`
  ([tools/wrappers.md](tools/wrappers.md#turn-stop-esc)) rejects the denied
  call's `execute` — a call with no result is what stops the AI SDK taking
  another step — so the attempt drains with exactly one unpaired call, holding
  the denial text that was already rendered for it. This puts that text back as
  a real `tool-result`, matched by `toolCallId`. `agent/loop.ts` runs it before
  anything else sees the turn, so `dropUnpairedToolCalls` still never has work
  to do. **Without it the guard rail is destructive**: it strips the call, the
  turn sanitizes to nothing, and `Conversation.commitTurn` drops the user's own
  message with it — the exact loss `docs/bug log/05-08-2026.md` fixed. The
  denial texts are consumed in order (the tools run serialized), which affects
  only which wording lands on which call, never the pairing.
- `flattenToolMessagesToText` rewrites native tool messages into the text
  protocol. [parsed-tools.md](parsed-tools.md) and [fake-loop.md](fake-loop.md)
  call `streamText` with **no `tools` parameter**, so a `role: 'tool'` message
  left by an earlier native turn is a request referencing tools it never
  declared — a 400 on OpenAI and several compat providers. Reachable as soon as
  native turns persist: `/model` from a native model to a parsed-tools one
  mid-session resends the native history. Both loops flatten their incoming
  history for this reason.

## Key neighbors

`agent/conversation.ts` (`commitTurn` calls the sanitizer, and decides whether the
turn produced anything from what survives it),
`agent/stream-turn.ts` (produces the native `turnMessages`),
`agent/parsed-tools.ts` and `agent/fake-loop.ts` (consume the flattener).

## Update triggers

A new tool protocol, a change to what `runRecoveringStream` collects, or a
provider that rejects a message shape these rules currently allow.

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Owns the constraints on the messages a turn contributes back to the
session history. Read it before changing what any loop returns as `turnMessages`,
or before adding a fourth tool protocol.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Give the tool call(s) a stopped turn left unanswered the results that were
 * already rendered for them, so the turn commits as balanced call/result pairs.
 *
 * Esc ends a turn by rejecting out of the tool's `execute` (see
 * `agent/tools/index.ts` `withTurnStop`), which is precisely what stops the AI
 * SDK taking another step — but a rejected execute also produces no
 * `tool-result` part, so the call it denied comes back unpaired. Without this,
 * `dropUnpairedToolCalls` would strip the call, the turn would sanitize to
 * nothing, and `Conversation.commitTurn` would drop the user's own message with
 * it — the very loss `docs/bug log/05-08-2026.md` fixed.
 *
 * Which calls need repairing is decided by `toolCallId`. `denials` is consumed
 * in order: the tools run serialized (`withSerializedExecution`), so the nth
 * unpaired call is the nth stop, and a count mismatch only costs precision of
 * wording, never the pairing itself.
 */
pairStoppedToolCalls(messages: CoreMessage[], denials: string[]): CoreMessage[]

/**
 * Drop any assistant `tool-call` part with no matching `tool-result`, and any
 * assistant message left with nothing but whitespace afterwards.
 *
 * A provider that receives a tool call without its result answers 400 — and it
 * does so on every *later* request too, because the orphan is now a permanent
 * part of the history. That makes an unbalanced append the one failure mode
 * that can brick a session rather than just spoil a turn.
 *
 * This is a guard rail, not the mechanism: `runRecoveringStream` only collects
 * response messages from an attempt that drained, and those are already
 * balanced — except for a turn stopped by Esc, whose one unpaired call
 * `pairStoppedToolCalls` above balances before this ever runs. If this drops
 * something, the invariant upstream broke — hence the log line.
 */
dropUnpairedToolCalls(messages: CoreMessage[]): CoreMessage[]

/**
 * Rewrite native tool messages into the text protocol.
 *
 * The parsed-tools and fake loops call `streamText` *without* a `tools`
 * parameter, so a `role: 'tool'` message in the history is a request that
 * references tools the request never declared — OpenAI and several
 * OpenAI-compatible providers 400 on exactly that. It is reachable as soon as
 * native turns persist: switch from a native model to a parsed-tools one with
 * `/model` mid-session and the next turn resends the native history.
 *
 * Flattening to the same `<tool_result>` text those loops already produce keeps
 * the history readable to the model instead of discarding it.
 */
flattenToolMessagesToText(messages: CoreMessage[]): CoreMessage[]
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`logger.ts`](../logger.md) ×1
- **Imported by:** [`agent/conversation.ts`](conversation.md) ×1, [`agent/fake-loop.ts`](fake-loop.md) ×1, [`agent/loop.ts`](loop.md) ×1, [`agent/parsed-tools.ts`](parsed-tools.md) ×1

## Tests

`tests/agent/turn-messages.test.ts`.

## Budget

194 / 500 lines (306 to spare).
<!-- END GENERATED MAP FACTS -->
