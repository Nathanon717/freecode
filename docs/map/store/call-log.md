# src/store/call-log.ts - Per-Call LLM Log

**Role:** Defines the `llm_calls` row shape, normalizes provider-reported token counts, and hands rows to `db.ts` for persistence. Called from the adapter fetch wrapper — the only path that makes completion calls — so no LLM call can complete without producing a row.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * One LLM HTTP call. Token fields are populated only from a usage object the
 * provider actually returned — never estimated, never counted locally. A null
 * token field means "the provider did not tell us", which is information.
 */
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

/**
 * Pull token counts out of a raw provider usage payload: the OpenAI-compatible
 * shape (`prompt_tokens`/`completion_tokens`/`total_tokens`). A payload missing
 * `total_tokens` gets it summed; anything unrecognised yields all-null.
 */
tokensFromUsagePayload(usage: unknown): Pick<LlmCallRow, "inputTokens" | "outputTokens" | "totalTokens">

/**
 * Record one LLM call. Fire-and-forget and never throws — a logging failure
 * must never break the call it is describing.
 */
recordLlmCall(row: Omit<LlmCallRow, "timestamp"> & { timestamp?: string | undefined; }): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`store/db.ts`](db.md) ×1, [`util/guards.ts`](../util/guards.md) ×1
- **Imported by:** [`providers/adapters/openai-compat.ts`](../providers/adapters/openai-compat.md) ×5, [`store/db.ts`](db.md) ×1

## Tests

`tests/store/call-log.test.ts`. 1 other test file references it.

## Budget

51 / 500 lines (449 to spare).
<!-- END GENERATED MAP FACTS -->

## Why It Exists

Free models often document no rate limits and send no rate-limit headers. A durable log of `(model_key, timestamp, tokens)` makes those ceilings inferable empirically, and lets explicitly-stated limits be checked against observed traffic.

## No Estimation

Token fields are populated **only** from a usage object the provider actually returned. Nothing is counted locally or inferred. A null token column means "the provider did not tell us" — that absence is itself the signal, so it must never be backfilled with a guess or a zero. `tokensFromUsagePayload` handles only the OpenAI-compatible shape (`prompt_tokens`/`completion_tokens`/`total_tokens`); `total_tokens` is summed only when both halves are present, and unrecognised payloads yield all-null. Anthropic now sends this shape too, routed through the same adapter.

## Chokepoints

- `adapters/openai-compat.ts` — the only adapter; logs on transport failure, on HTTP error (before the throw), and on success by teeing the existing `parseProviderUsage` promise into the log. Derives `model_key` as `"provider:modelId"` from the outgoing request body, falling back to `"provider:unknown"` — the row is still worth having when the body is unparseable.

## Read When

Adding a second adapter (it must call `recordLlmCall` on all three paths), changing which fields are logged, or querying the log to infer rate limits.

## Key Neighbors

- [db.md](./db.md): owns the `llm_calls` table and `persistCallLogAsync`.
- [quota/headers.md](../providers/quota/headers.md): the complementary source — header *ceilings*, versus this file's observed *usage*.
