# 2026-06-07 — Transcript Layout Normalisation

## What Was Built

A module-level state machine in `transcript-renderer.ts` that is now the single authority for all blank-line placement in the visible agent transcript. Every execution path (fake model, streamText, OpenAI Responses, prompt-tools fallback) drives the same four functions, so model-specific whitespace differences can never leak into the displayed output.

## Desired Layout (enforced)

Each model step is wrapped in a pair of `───` dividers. Between consecutive steps the dividers are merged (close of step N = open of step N+1).

```
───

[response text]         (optional)

[rationale]             (optional — sits directly above the tool call)
[tool call + result]    (optional)

───
```

Multiple tool calls in the same step are separated by a blank line. When both response text and tool calls are present, a blank line separates them.

## Key Decisions

- **Single state machine, one source of truth.** Previous code had spacing logic scattered across `tools/index.ts` (`firstCallTracker`), `loop.ts` (`onStepFinish`), and `prompt-tools.ts`. Any model that omitted trailing newlines or produced text+tool in the same step could break the layout. Now the renderer absorbs all variation.

- **Idempotent `beginTranscriptTurn`.** The while-loop retry and prompt-tools fallback paths both call `beginTranscriptTurn()`; since it's a no-op when the turn is already open, double-calls are safe.

- **Final step deferred.** `onStepFinish` only handles intermediate steps (`finishReason === 'tool-calls'`). The final step's divider is written *after* text normalisation (`trimEnd` + trailing-`\n` enforcement) so the blank line before the closing divider is never wrong.

- **`endTranscriptStep` is a no-op when no turn is open.** Error and abort return paths all call it; it is safe to call from any code path.

- **`firstCallTracker` removed.** The old `{ done: boolean }` object passed through `wrap()` → `withLogging()` is gone. `writeTranscriptToolLeadIn()` reads from the module-level `_step` state instead.

## Files Changed

| File | Change |
|---|---|
| `src/cli/transcript-renderer.ts` | Added `_StepState`, `beginTranscriptTurn`, `notifyTranscriptChunk`, `writeTranscriptToolLeadIn`, `endTranscriptStep` |
| `src/agent/tools/index.ts` | Removed `firstCallTracker`; `withLogging` calls `writeTranscriptToolLeadIn()` |
| `src/agent/loop.ts` | All three execution paths (fake, OpenAI, streamText) call begin/notify/end; `onStepFinish` drives `endTranscriptStep(true)` for intermediate steps |
| `src/agent/prompt-tools.ts` | `beginTranscriptTurn` at entry; `endTranscriptStep(true/false)` at each step boundary; removed `writeTranscriptStepDivider` call |
| `src/providers/adapters/openai-responses.ts` | `writeTranscriptStepDivider()` → `endTranscriptStep(true)` |
| `docs/map/cli/transcript-renderer.md` | Full rewrite documenting the state machine and desired layout |
| `docs/map/agent/loop.md` | Updated tool-behavior note |
| `docs/map/agent/tools/index.md` | Updated `withLogging` description |

## Verification

`npm test` passes (40 test files, 318 tests, all non-LLM scenarios). The layout can be confirmed visually with the `pty` tool: start a session with a tool-using model, send a prompt, and observe that each step is cleanly framed.
