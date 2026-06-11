# pricing-verifier.ts

**Purpose:** Dual-source pricing verifier. Fetches rates from LiteLLM and OpenRouter in parallel, compares them, and returns a confidence-tagged result used to color-code cost estimates in the UI.

**Read when:** Tracing how `costEstimate.confidence` is set, debugging "sources disagree" or missing pricing, or adding support for a new provider's pricing.

**Exports:**
- `getAnthropicVerifiedRates(modelId)` → `Promise<VerifiedRates>` — called by `agent/loop.ts` after each Anthropic turn
- `getOpenAIVerifiedRates(modelId)` → `Promise<VerifiedRates>` — called by `commands/model.ts` to show pricing in the model picker
- `getVerifiedRates(litellmKey, openrouterKey)` → `Promise<VerifiedRates>` — low-level entry point for other providers
- `getLiteLLMRates()` / `getOpenRouterRates()` — lazy-cached fetch of each source; reused across turns in a session
- `PricingConfidence` — `'agreed' | 'litellm-only' | 'openrouter-only' | 'disagree'`
- `VerifiedRates` — `{ confidence, inputPerMillion, outputPerMillion }`
- `LITELLM_PRICING_URL` / `OPENROUTER_MODELS_URL` — source URLs

**Agreement logic:** Prices are considered equal when within 2% of each other on both input and output rates. If only one source returns a rate the result is `litellm-only` or `openrouter-only`. If both are present but diverge beyond tolerance the result is `disagree`. Lookup normalizes common provider key differences, including date suffixes, provider prefixes, and Anthropic hyphenated versus dotted version IDs such as `claude-opus-4-5` / `anthropic/claude-opus-4.5`.

**Key neighbors:** `anthropic-cost.ts` (consumes `VerifiedRates`), `agent/loop.ts` (caller for Anthropic), `commands/model.ts` (caller for OpenAI model picker), `cli/command-dispatcher.ts` (renders confidence as color via `describeCostEstimate`).

**Update triggers:** Agreement tolerance needs tuning, a new provider needs verified pricing, or either source URL changes.
