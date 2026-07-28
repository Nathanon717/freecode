# src/agent/conversation.ts - Session Controller

**Role:** Owns the in-memory conversation for a CLI session.

## Note

`commitTurn` is the only append path, and it is all-or-nothing: the user's
message and everything the turn produced go in together, or nothing does. A turn
that produced literally nothing (Esc at a tool approval, a provider error on the
first byte) leaves history untouched, so the model is never shown a request it
never answered — see `docs/bug log/28-07-2026.md`. That is why the dispatcher
passes the user message *in* rather than appending it before the turn runs, and
why `agentLoop` reading its `messages` argument without mutating it is
load-bearing.

It persists the assistant text **plus the tool calls and their results**, so a
follow-up turn continues from the work rather than from the model's prose summary
of it. The third argument is the fallback for turns that carry no messages of
their own: the partial text they did emit, used only when the sanitized turn is
empty. Blank/whitespace-only assistant content is dropped — an empty assistant
turn carries no information and Mistral 400s on any history containing an
assistant message with neither content nor `tool_calls`
(`docs/bug log/18-07-2026b.md`) — but only when *genuinely* empty: an assistant
message with `tool_calls` and no text is legal and must survive, which is exactly
the distinction Mistral draws. Emptiness is judged **after** sanitizing, so a turn
whose only content was an unpaired tool call commits nothing rather than
stranding the user message. Shape sanitizing (dropping tool calls with no
matching result) lives in [turn-messages.md](turn-messages.md); the sources of
`turnMessages` are [loop.md](loop.md), [parsed-tools.md](parsed-tools.md) and
[fake-loop.md](fake-loop.md).

Because tool results now persist, context grows much faster than it used to — a
single large `read` stays in history for the rest of the session. `/clear` is the
release valve.

No longer provides token estimation. `getContextTokenCount()` (backed by the deleted `agent/token-count.ts`) was removed in the tokenizer-engine work (`docs/plans/tokenizer-registry-plan.md` Phase 1) — see `docs/map/tokenizers/count.md` for the standalone engine that replaces it. A later "live counter" task wires `src/tokenizers/count.ts`'s `countTokens` into the footer directly, without going back through `Conversation`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
class Conversation {
  readonly projectRoot: string;
  messages: CoreMessage[];
  constructor(projectRoot: string): Conversation;
  clearMessages(): void;
  commitTurn(userMessage: CoreMessage, turnMessages: CoreMessage[], assistantText: string): boolean;
}
```
<!-- END GENERATED EXPORTS -->
