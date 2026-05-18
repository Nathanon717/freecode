# src/agent/token-count.ts - Context Token Estimator

**Role:** Lightweight, provider-agnostic estimate of context tokens for the bottom terminal status line.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `estimateTextTokens` | `(text: string) => number` | Splits words/punctuation and approximates word chunks as one token per four characters. |
| `estimateMessageTokens` | `(message: CoreMessage) => number` | Adds per-message overhead plus role/content estimates. |
| `estimateContextTokens` | `(messages: CoreMessage[]) => number` | Adds request overhead, current system prompt tokens, and all message estimates. |

## Content Handling

`stringifyContent()` supports plain strings, primitives, arrays, `{ text }`, `{ content }`, and JSON fallback for other objects.

## Used By

- [cli/session-controller.md](../cli/session-controller.md) exposes `getContextTokenCount()`.
- [cli/terminal-ui.md](../cli/terminal-ui.md) displays the count in the bottom status row.

## Caveat

This is an approximation for UI feedback, not billing or provider accounting. Actual usage comes from `streamText().usage`.
