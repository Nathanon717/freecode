# src/util/errors.ts - Shared Error Utilities

**Purpose:** Shared error-formatting utilities.

**Read when:** You need a consistent way to extract a string message from an `unknown` catch value, or to surface provider/API details from structured error payloads.

**Key neighbors:** `src/agent/loop.ts`, `src/agent/tools/index.ts`, `src/cli/command-dispatcher.ts`

**Update triggers:** New error-related utilities needed in two or more source files.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
toErrorMessage(error: unknown): string

toDetailedErrorMessage(error: unknown): string

isContextOverflowError(error: unknown): boolean

isProviderToolUseFailed(error: unknown): boolean

isNoSuchToolError(error: unknown): boolean

noSuchToolName(error: unknown): string | null

noSuchToolAvailableList(error: unknown): string | null

isInvalidToolArgumentsError(error: unknown): boolean

invalidToolName(error: unknown): string | null

/**
 * How many rejected tool calls one turn may recover from. The model is told what
 * went wrong and keeps going, so a bad call costs a step rather than the turn;
 * the cap stops a model that keeps reissuing the same broken call from looping.
 */
MAX_REJECTED_TOOL_CALLS: 8

interface RejectedToolCall {
  name: string;
  /** What the model sent, for rendering the call it attempted; empty for an unknown name. */
  args: Record<string, unknown>;
  /** The message to hand back so the model can correct itself and continue. */
  feedback: string;
}

/**
 * A tool call the AI SDK refused before it could run: an unknown name, or arguments
 * that failed the tool's schema. Neither ever reaches `execute`, so neither produces
 * a tool result — and the SDK then stops stepping, because it only continues when
 * every call has one. Recognising these lets a turn feed the failure back and carry
 * on instead of ending. Returns null when the error is something else.
 */
rejectedToolCall(error: unknown): RejectedToolCall | null

/**
 * Thrown out of a tool's `execute` after the user pressed Esc at its approval
 * prompt, to end the turn without another model call.
 *
 * It is a throw rather than a returned result on purpose: the AI SDK only takes
 * another step when *every* tool call in the step produced a result, so an
 * execute that rejects is the one lever that stops the step loop while still
 * letting `streamText` finish gracefully (finishReason `error`, `responseMessages`
 * resolved). The call it stopped is therefore left unpaired in those messages —
 * `denialResult` is the result text that was already rendered for it, which
 * `agent/turn-messages.ts` `pairStoppedToolCalls` puts back so the turn commits
 * as a balanced call/result pair. See `docs/bug log/06-08-2026.md`.
 */
class TurnStoppedError extends Error {
  readonly denialResult: string;
  constructor(denialResult: string): TurnStoppedError;
}

isTurnStoppedError(error: unknown): error is TurnStoppedError

isToolsNotSupportedError(error: unknown): boolean

isModelNotFoundError(error: unknown): boolean

serializeError(error: unknown): unknown
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`util/guards.ts`](guards.md) ×5
- **Imported by:** [`agent/loop.ts`](../agent/loop.md) ×10, [`agent/stream-turn.ts`](../agent/stream-turn.md) ×6, [`agent/tools/wrappers.ts`](../agent/tools/wrappers.md) ×4, [`cli/command-dispatcher.ts`](../cli/command-dispatcher.md) ×2, [`agent/fake-loop.ts`](../agent/fake-loop.md) ×1, [`agent/parsed-tools.ts`](../agent/parsed-tools.md) ×1, [`cli/tools/tool-runner.ts`](../cli/tools/tool-runner.md) ×1

## Tests

`tests/util/errors.test.ts`. 2 other test files reference it.

## Budget

316 / 500 lines (184 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `toErrorMessage(error)` — returns `error.message` for `Error` instances, `String(error)` otherwise.
- `toDetailedErrorMessage(error)` — includes parsed provider details such as `code`, `type`, `param`, `failed_generation`, response bodies, and a `tool_use_failed` diagnosis when available.
- `isContextOverflowError(error)` — returns `true` when the error message matches any of the known context-overflow patterns across providers (Anthropic, OpenAI, Gemini, Ollama, etc.).
- `isProviderToolUseFailed(error)` — returns `true` when the provider returned `code: tool_use_failed`.
- `rejectedToolCall(error)` — the shared classifier for a call the AI SDK refused **before** `execute` ran: an unknown name (`AI_NoSuchToolError`) or arguments that failed the tool's schema (`AI_InvalidToolArgumentsError`). Neither produces a tool result, and the SDK stops stepping when results don't match calls, so both would end a turn. Returns the tool name, the arguments the model sent (for rendering the attempted call; empty for an unknown name), and the feedback message to hand back. Both native tool loops — `agent/loop.ts` and `agent/subagents/run-subagent.ts` — use it with `MAX_REJECTED_TOOL_CALLS` to recover mid-turn instead of aborting. Lives here rather than in either loop so the two cannot drift.
