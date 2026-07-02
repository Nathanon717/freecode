# src/agent/session-controller.ts - Session Controller

**Role:** Owns the in-memory conversation for a CLI session.

## Note

No longer provides token estimation. `getContextTokenCount()` (backed by the deleted `agent/token-count.ts`) was removed in the tokenizer-engine work (`docs/plans/tokenizer-registry-plan.md` Phase 1) — see `docs/map/tokenizers/count.md` for the standalone engine that replaces it. A later "live counter" task wires `src/tokenizers/count.ts`'s `countTokens` into the footer directly, without going back through `SessionController`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
class SessionController {
  readonly projectRoot: string;
  messages: CoreMessage[];
  constructor(projectRoot: string): SessionController;
  clearMessages(): void;
  addUserMessage(content: string): void;
  addAssistantMessage(content: string): void;
}
```
<!-- END GENERATED EXPORTS -->
