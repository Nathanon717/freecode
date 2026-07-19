# src/store/call-log.ts - Per-Call LLM Log

**Role:** Defines the `llm_calls` row shape, normalizes provider-reported token counts, and hands rows to `db.ts` for persistence. Called from the two adapter fetch wrappers — the only paths that make completion calls — so no LLM call can complete without producing a row.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface LlmCallRow {
  /** `"provider:modelId"`, matching the `models` table key format. */
  modelKey: string;
  /** ISO-8601 UTC. */
  timestamp: string;
  /** HTTP status, or null if the request never produced a response. */
  status?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  /** Full error text when the call failed. */
  error?: string | null;
}

tokensFromUsagePayload(usage: unknown): Pick<LlmCallRow, "inputTokens" | "outputTokens" | "totalTokens">

recordLlmCall(row: Omit<LlmCallRow, "timestamp"> & { timestamp?: string | undefined; }): void
```
<!-- END GENERATED EXPORTS -->

## Why It Exists

Free models often document no rate limits and send no rate-limit headers. A durable log of `(model_key, timestamp, tokens)` makes those ceilings inferable empirically, and lets explicitly-stated limits be checked against observed traffic.

## No Estimation

Token fields are populated **only** from a usage object the provider actually returned. Nothing is counted locally or inferred. A null token column means "the provider did not tell us" — that absence is itself the signal, so it must never be backfilled with a guess or a zero. `tokensFromUsagePayload` handles the OpenAI-compatible shape (`prompt_tokens`/`completion_tokens`/`total_tokens`) and the Anthropic shape (`input_tokens`/`output_tokens`); `total_tokens` is summed only when both halves are present, and unrecognised payloads yield all-null.

## Chokepoints

- `adapters/openai-compat.ts` — logs on transport failure, on HTTP error (before the throw), and on success by teeing the existing `parseProviderUsage` promise into the log.
- `adapters/anthropic.ts` — same three paths; success reuses the `parseAnthropicUsageFromSse` promise, and `hasRawUsage === false` keeps tokens null rather than reporting the zeroed accumulator.

Both wrappers derive `model_key` as `"provider:modelId"` from the outgoing request body, falling back to `"provider:unknown"` — the row is still worth having when the body is unparseable.

## Read When

Adding a third adapter (it must call `recordLlmCall` on all three paths), changing which fields are logged, or querying the log to infer rate limits.

## Key Neighbors

- [db.md](./db.md): owns the `llm_calls` table and `persistCallLogAsync`.
- [quota/headers.md](../providers/quota/headers.md): the complementary source — header *ceilings*, versus this file's observed *usage*.
