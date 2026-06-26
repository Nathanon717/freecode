# src/providers/pricing-verifier.ts - Dual-Source Pricing Verifier

**Purpose:** Dual-source pricing verifier. Fetches rates from LiteLLM and OpenRouter in parallel, compares them, and returns a confidence-tagged result used to color-code cost estimates in the UI.

**Read when:** Tracing how `costEstimate.confidence` is set, debugging "sources disagree" or missing pricing, or adding support for a new provider's pricing.

**Agreement logic:** Prices are considered equal when within 2% of each other on both input and output rates. If only one source returns a rate the result is `litellm-only` or `openrouter-only`. If both are present but diverge beyond tolerance the result is `disagree`. Lookup normalizes common provider key differences, including date suffixes, provider prefixes, and Anthropic hyphenated versus dotted version IDs such as `claude-opus-4-5` / `anthropic/claude-opus-4.5`.

**Key neighbors:** `anthropic-cost.ts` (consumes `VerifiedRates`), `agent/loop.ts` (caller for Anthropic), `commands/model.ts` (caller for OpenAI model picker), `cli/command-dispatcher.ts` (renders confidence as color via `describeCostEstimate`).

**Update triggers:** Agreement tolerance needs tuning, a new provider needs verified pricing, or either source URL changes.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type PricingConfidence = 'agreed' | 'litellm-only' | 'openrouter-only' | 'disagree';

interface VerifiedRates {
  confidence: PricingConfidence;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
}

LITELLM_PRICING_URL: 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

OPENROUTER_MODELS_URL: 'https://openrouter.ai/api/v1/models'

getLiteLLMRates(): Promise<RateMap>

getOpenRouterRates(): Promise<RateMap>

getVerifiedRates(litellmKey: string, openrouterKey: string): Promise<VerifiedRates>

getAnthropicVerifiedRates(modelId: string): Promise<VerifiedRates>

getOpenAIVerifiedRates(modelId: string): Promise<VerifiedRates>
```
<!-- END GENERATED EXPORTS -->
