# src/util/errors.ts

**Purpose:** Shared error-formatting utilities.

**Read when:** You need a consistent way to extract a string message from an `unknown` catch value, or to surface provider/API details from structured error payloads.

**Exports:**
- `toErrorMessage(error)` - returns `error.message` for `Error` instances, `String(error)` otherwise.
- `toDetailedErrorMessage(error)` - includes parsed provider details such as `code`, `type`, `param`, `failed_generation`, response bodies, and a `tool_use_failed` diagnosis when available.
- `isContextOverflowError(error)` - returns `true` when the error message matches any of the known context-overflow patterns across providers (Anthropic, OpenAI, Gemini, Ollama, etc.).
- `isProviderToolUseFailed(error)` - returns `true` when the provider returned `code: tool_use_failed`.

**Key neighbors:** `src/agent/loop.ts`, `src/agent/tools/index.ts`, `src/cli/command-dispatcher.ts`, `src/providers/anthropic-cost.ts`, `src/providers/openai-cost.ts`

**Update triggers:** New error-related utilities needed in two or more source files.
