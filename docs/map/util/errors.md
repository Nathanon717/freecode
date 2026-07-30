# src/util/errors.ts - Shared Error Utilities

**Purpose:** Shared error-formatting utilities.

**Read when:** You need a consistent way to extract a string message from an `unknown` catch value, or to surface provider/API details from structured error payloads.

**Key neighbors:** `src/agent/loop.ts`, `src/agent/tools/index.ts`, `src/cli/command-dispatcher.ts`

**Update triggers:** New error-related utilities needed in two or more source files.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
class UserAbortError extends Error {
  constructor(): UserAbortError;
}

isUserAbortError(error: unknown): boolean

toErrorMessage(error: unknown): string

toDetailedErrorMessage(error: unknown): string

isContextOverflowError(error: unknown): boolean

isProviderToolUseFailed(error: unknown): boolean

isNoSuchToolError(error: unknown): boolean

noSuchToolName(error: unknown): string | null

noSuchToolAvailableList(error: unknown): string | null

isInvalidToolArgumentsError(error: unknown): boolean

invalidToolName(error: unknown): string | null

MAX_REJECTED_TOOL_CALLS: 8

interface RejectedToolCall {
  name: string;
  /** What the model sent, for rendering the call it attempted; empty for an unknown name. */
  args: Record<string, unknown>;
  /** The message to hand back so the model can correct itself and continue. */
  feedback: string;
}

rejectedToolCall(error: unknown): RejectedToolCall | null

isToolsNotSupportedError(error: unknown): boolean

isModelNotFoundError(error: unknown): boolean

serializeError(error: unknown): unknown
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `toErrorMessage(error)` — returns `error.message` for `Error` instances, `String(error)` otherwise.
- `toDetailedErrorMessage(error)` — includes parsed provider details such as `code`, `type`, `param`, `failed_generation`, response bodies, and a `tool_use_failed` diagnosis when available.
- `isContextOverflowError(error)` — returns `true` when the error message matches any of the known context-overflow patterns across providers (Anthropic, OpenAI, Gemini, Ollama, etc.).
- `isProviderToolUseFailed(error)` — returns `true` when the provider returned `code: tool_use_failed`.
- `rejectedToolCall(error)` — the shared classifier for a call the AI SDK refused **before** `execute` ran: an unknown name (`AI_NoSuchToolError`) or arguments that failed the tool's schema (`AI_InvalidToolArgumentsError`). Neither produces a tool result, and the SDK stops stepping when results don't match calls, so both would end a turn. Returns the tool name, the arguments the model sent (for rendering the attempted call; empty for an unknown name), and the feedback message to hand back. Both native tool loops — `agent/loop.ts` and `agent/subagents/run-subagent.ts` — use it with `MAX_REJECTED_TOOL_CALLS` to recover mid-turn instead of aborting. Lives here rather than in either loop so the two cannot drift.
