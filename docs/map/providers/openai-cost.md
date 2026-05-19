# openai-cost.ts

**Purpose:** Fallback pricing table and cost estimator for OpenAI models. Mirrors the structure of `anthropic-cost.ts` but uses simpler input/output-only pricing (no cache tiers).

**Read when:** Adding OpenAI models to the registry, updating pricing, or tracing how `costEstimate` is populated for OpenAI turns.

**Exports:**
- `estimateOpenAICost(modelId, promptTokens, completionTokens)` → `CostEstimate` — called by `agent/loop.ts` after each OpenAI turn
- `resetOpenAISessionCost()` / `addOpenAISessionCost()` / `getOpenAISessionCost()` — session-level accumulator (reset by `session-controller.ts`)
- `OPENAI_PRICING_URL` — canonical pricing reference

**Key neighbors:** `anthropic-cost.ts` (shared `CostEstimate` / `CostEstimateBreakdown` types), `agent/loop.ts` (caller), `cli/session-controller.ts` (reset on new session).

**Update triggers:** New OpenAI model added to registry, pricing changes, or new token-type fields appear in the OpenAI usage response.
