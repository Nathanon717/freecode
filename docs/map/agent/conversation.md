# src/agent/conversation.ts - Session Controller

**Role:** Owns the in-memory conversation for a CLI session.

## Note

`addAssistantMessage` drops blank/whitespace-only content. An empty assistant
turn carries no information and Mistral 400s on any history containing an
assistant message with neither content nor `tool_calls` — see
`docs/bug log/18-07-2026b.md`.

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
}
```
<!-- END GENERATED EXPORTS -->
