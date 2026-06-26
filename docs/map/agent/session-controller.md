# src/agent/session-controller.ts - Session Controller

**Role:** Owns the in-memory conversation for a CLI session and provides token estimation.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
class SessionController {
  readonly projectRoot: string;
  messages: CoreMessage[];
  constructor(projectRoot: string): SessionController;
  clearMessages(): void;
  getContextTokenCount(): number;
  addUserMessage(content: string): void;
  addAssistantMessage(content: string): void;
}
```
<!-- END GENERATED EXPORTS -->
