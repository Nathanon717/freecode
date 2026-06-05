# src/providers/registry.ts - Provider Registry

**Role:** Catalog of known cloud providers and their models. Source of provider IDs, display names, base URLs, API key env vars, tool support flags, model IDs, static model limits, and live-fetch init logic.

## Exports

```typescript
PROVIDER_REGISTRY: ProviderConfig[]
getProvider(id: string): ProviderConfig | undefined
getAllProviders(): ProviderConfig[]
initDynamicProviders(): Promise<void>   // fetches live model lists for all live-source providers
resolveModel(modelPreference: string): ResolvedModel
```

## Read When

- Adding, removing, or reordering a provider.
- Changing model IDs, display names, API key env vars, tool support, paid status, or static limits.
- Debugging router selection where registry order or provider metadata matters.

For the generated provider table, see [providers.md](../../providers.md).

## Special Cases

- LLM7 has `supportsTools: false`, so `agentLoop()` does not pass tools to that model.
- OpenAI has `type: "openai-compat"` and `paid: true`; uses the standard OpenAI-compatible adapter against `api.openai.com/v1`.
- Anthropic has `type: "anthropic"` and `paid: true`; routing uses the native Anthropic adapter instead of the OpenAI-compatible adapter.
- Cloudflare Workers AI uses a `baseUrl` templated from `process.env.CLOUDFLARE_ACCOUNT_ID` at module load time; requires both `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_KEY` env vars.
- Ollama is not in `PROVIDER_REGISTRY`; `createOllamaProvider()` lives in [adapters/openai-compat.md](adapters/openai-compat.md).
- Providers with `modelsSource: 'live'` have their model list fetched from the provider's `/v1/models` API at runtime via `initDynamicProviders()`. Most live providers start empty and use the cache from `model-cache.ts` on fetch failure; Zen keeps a curated current-free seed list for offline/default picker availability. All live fetches are gated on `resolveApiKey(provider)`, so env vars, default keys, and config-file keys enable discovery; if no key is configured, the fetch is skipped entirely.
- `mock:*` models are virtual and are not listed in `PROVIDER_REGISTRY`. `resolveModel()` only accepts them when `FREECODE_FAKE_LLM=1`, and fake mode rejects real provider resolution plus live model discovery.
- After fetching, live-provider model lists are deduplicated by `displayName`: when multiple IDs resolve to the same name (aliases), the versioned ID (date-stamped or semver) is kept and aliases are dropped.
- Live providers can use `modelIdBlocklist` for substring filters and `modelIdExactBlocklist` for exact ID filters before models are displayed. OpenAI uses the exact filter for `chat-latest` so versioned `*-chat-latest` models remain visible.
- Zen filters live and cached results to current free models, including explicit exclusions for retired free-period IDs.
- `initDynamicProviders` calls `updateProviderCache` on every successful fetch to persist results and detect new/removed models.

## Key Neighbors

- [adapters/openai-compat.md](adapters/openai-compat.md) and [adapters/anthropic.md](adapters/anthropic.md): provider factories consumed by `resolveModel()`.
- [config/index.md](../config/index.md): maps provider IDs to config/env keys.
- [providers.md](../../providers.md): generated reference output.
- [fake.md](fake.md): fake LLM fixture runner used by scenario verification.

## Update Triggers

Update this page when registry ownership, key consumers, or special-case behavior changes. Do not duplicate the provider inventory here.
