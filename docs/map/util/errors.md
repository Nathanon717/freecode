# src/util/errors.ts - Shared Error Utilities

**Purpose:** Shared error-formatting utilities.

**Read when:** You need a consistent way to extract a string message from an `unknown` catch value, or to surface provider/API details from structured error payloads.

**Key neighbors:** `src/agent/loop.ts`, `src/agent/tools/index.ts`, `src/cli/command-dispatcher.ts`, `src/providers/anthropic-cost.ts`

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
