# src/agent/conversation.ts - Session Controller

**Role:** Owns the in-memory conversation for a CLI session.

## Note

`addAssistantMessage` drops blank/whitespace-only content. An empty assistant
turn carries no information and Mistral 400s on any history containing an
assistant message with neither content nor `tool_calls` — see
`docs/bug log/18-07-2026b.md`.

`addTurnMessages` is the normal append path for a turn; `addAssistantMessage` is
now the fallback for turns that produced no messages (provider error, abort). It
persists the assistant text **plus the tool calls and their results**, so a
follow-up turn continues from the work rather than from the model's prose summary
of it. The empty-assistant rule above still applies, but only to messages that
are genuinely empty — an assistant message with `tool_calls` and no text is legal
and must survive, which is exactly the distinction Mistral draws. Shape
sanitizing (dropping tool calls with no matching result) lives in
[turn-messages.md](turn-messages.md); the sources of `turnMessages` are
[loop.md](loop.md), [parsed-tools.md](parsed-tools.md) and
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
  addUserMessage(content: string): void;
  addAssistantMessage(content: string): void;
  addTurnMessages(messages: CoreMessage[]): boolean;
}
```
<!-- END GENERATED EXPORTS -->
