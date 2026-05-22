# src/providers/openai-cost.ts - OpenAI Cost Estimates

**Role:** Cost estimator for OpenAI models. The primary production path is `estimateOpenAICostVerified` with rates from `pricing-verifier.ts`; `estimateOpenAICost` with an `OpenAIPricingTable` is retained for the legacy LiteLLM-only path.

## Exports

- `estimateOpenAICostVerified(modelId, promptTokens, completionTokens, rates)` - production turn-cost estimator called by `agent/loop.ts`.
- `estimateOpenAIInputCostVerified(inputTokens, rates)` - exact input-token cost helper for live OpenAI preflight UI; returns unavailable when pricing is missing or disputed.
- `estimateOpenAICost(modelId, promptTokens, completionTokens, pricingTable)` - legacy LiteLLM-only estimator.
- `resetOpenAISessionCost()` / `addOpenAISessionCost()` / `getOpenAISessionCost()` - session-level accumulator reset by `session-controller.ts`.
- `OPENAI_PRICING_URL` - LiteLLM pricing JSON URL kept for backward compatibility.

## Read When

- Adding OpenAI models to the registry.
- Tracing how OpenAI `costEstimate` is populated for completed turns.
- Debugging pricing confidence or live preflight input-cost display.

## Key Neighbors

- [anthropic-cost.md](anthropic-cost.md): shared `CostEstimate` / `CostEstimateBreakdown` types and USD formatter.
- [pricing-verifier.md](pricing-verifier.md): provides verified rates.
- [../agent/loop.md](../agent/loop.md): estimates completed OpenAI turn cost.
- [../cli/preflight-input-cost.md](../cli/preflight-input-cost.md): estimates live input-token cost from exact preflight counts.
- [../cli/session-controller.md](../cli/session-controller.md): resets session totals.

## Update Triggers

Update this page when OpenAI pricing inputs, confidence handling, token-type fields, or exported cost helpers change.
