# openai-cost.ts

**Purpose:** Cost estimator for OpenAI models. The primary production path is `estimateOpenAICostVerified` (fed by `pricing-verifier.ts`); `estimateOpenAICost` with an `OpenAIPricingTable` is retained for the legacy LiteLLM-only path.

**Read when:** Adding OpenAI models to the registry, tracing how `costEstimate` is populated for OpenAI turns, or debugging pricing confidence.

**Exports:**
- `estimateOpenAICostVerified(modelId, promptTokens, completionTokens, rates: VerifiedRates)` → `CostEstimate` — production path, called by `agent/loop.ts`
- `estimateOpenAICost(modelId, promptTokens, completionTokens, pricingTable)` → `CostEstimate` — legacy path
- `resetOpenAISessionCost()` / `addOpenAISessionCost()` / `getOpenAISessionCost()` — session-level accumulator (reset by `session-controller.ts`)
- `OPENAI_PRICING_URL` — LiteLLM pricing JSON URL (kept for backward compat)

**Key neighbors:** `anthropic-cost.ts` (shared `CostEstimate` / `CostEstimateBreakdown` types), `pricing-verifier.ts` (provides `VerifiedRates`), `agent/loop.ts` (caller), `cli/session-controller.ts` (reset on new session).

**Update triggers:** New OpenAI model added to registry, pricing source changes, or new token-type fields appear in the OpenAI usage response.
