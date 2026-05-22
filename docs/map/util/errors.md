# src/util/errors.ts

**Purpose:** Shared error-formatting utilities.

**Read when:** You need a consistent way to extract a string message from an `unknown` catch value.

**Exports:**
- `toErrorMessage(error)` — returns `error.message` for `Error` instances, `String(error)` otherwise.

**Key neighbors:** `src/agent/loop.ts`, `src/agent/tools/index.ts`, `src/cli/command-dispatcher.ts`, `src/cli/preflight-input-cost.ts`, `src/providers/anthropic-cost.ts`, `src/providers/openai-cost.ts`

**Update triggers:** New error-related utilities needed in two or more source files.
