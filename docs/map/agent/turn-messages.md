# src/agent/turn-messages.ts - Turn Message Shape Rules

**Role:** Owns both constraints on the messages a turn contributes back to the
session history. Read it before changing what any loop returns as `turnMessages`,
or before adding a fourth tool protocol.

## Why it exists

Two tool protocols write into the same `Conversation`:

- the **native** path emits real `tool-call` parts on an assistant message plus a
  `role: 'tool'` message of matching `tool-result` parts;
- the **parsed-tools** and **fake** paths emit the text protocol — a plain
  assistant message and a plain user message of `<tool_result>` blocks.

Text-protocol messages are accepted everywhere and need no translation. Native
tool messages are the constrained direction, and both exports below exist for
them.

## Export notes

- `dropUnpairedToolCalls` is a **guard rail, not the mechanism**. A tool call
  persisted without its result 400s the provider on every *later* request too —
  the one failure mode that bricks a session rather than spoiling a turn. The
  real invariant lives in [stream-turn.md](stream-turn.md): `runRecoveringStream`
  only collects response messages from an attempt that **drained**, and those are
  already balanced. If this function ever drops something, that invariant broke
  upstream — hence the log line. Do not grow it into an elaborate repair pass.
- `flattenToolMessagesToText` rewrites native tool messages into the text
  protocol. [parsed-tools.md](parsed-tools.md) and [fake-loop.md](fake-loop.md)
  call `streamText` with **no `tools` parameter**, so a `role: 'tool'` message
  left by an earlier native turn is a request referencing tools it never
  declared — a 400 on OpenAI and several compat providers. Reachable as soon as
  native turns persist: `/model` from a native model to a parsed-tools one
  mid-session resends the native history. Both loops flatten their incoming
  history for this reason.

## Key neighbors

`agent/conversation.ts` (`addTurnMessages` calls the sanitizer),
`agent/stream-turn.ts` (produces the native `turnMessages`),
`agent/parsed-tools.ts` and `agent/fake-loop.ts` (consume the flattener).

## Update triggers

A new tool protocol, a change to what `runRecoveringStream` collects, or a
provider that rejects a message shape these rules currently allow.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
dropUnpairedToolCalls(messages: CoreMessage[]): CoreMessage[]

flattenToolMessagesToText(messages: CoreMessage[]): CoreMessage[]
```
<!-- END GENERATED EXPORTS -->
