# src/providers/registry.ts - Provider Registry

**Role:** Catalog of known cloud providers and their models. Source of provider IDs, display names, base URLs, API key env vars, tool support flags, model IDs, static model limits, and live-fetch init logic.

## Exports

```typescript
PROVIDER_REGISTRY: ProviderConfig[]
getProvider(id: string): ProviderConfig | undefined
getAllProviders(): ProviderConfig[]
initDynamicProviders(): Promise<void>   // fetches live model lists for all live-source providers
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
- Ollama is not in `PROVIDER_REGISTRY`; it is detected dynamically in [ollama.md](ollama.md).
- Providers with `modelsSource: 'live'` (openrouter, groq, siliconflow, cerebras, mistral, openai, anthropic) have their model list fetched from the provider's `/v1/models` API at runtime via `initDynamicProviders()`. There are no hardcoded fallback model lists; on fetch failure the cache from `model-cache.ts` is used instead. All live fetches are gated on the provider's API key being present — if no key is configured, the fetch is skipped entirely.
- After fetching, live-provider model lists are deduplicated by `displayName`: when multiple IDs resolve to the same name (aliases), the versioned ID (date-stamped or semver) is kept and aliases are dropped.
- Live providers can use `modelIdBlocklist` for substring filters and `modelIdExactBlocklist` for exact ID filters before models are displayed. OpenAI uses the exact filter for `chat-latest` so versioned `*-chat-latest` models remain visible.
- `initDynamicProviders` calls `updateProviderCache` on every successful fetch to persist results and detect new/removed models.

## Key Neighbors

- [router.md](router.md): consumes registry entries for provider selection.
- [config/index.md](../config/index.md): maps provider IDs to config/env keys.
- [providers.md](../../providers.md): generated reference output.

## Update Triggers

Update this page when registry ownership, key consumers, or special-case behavior changes. Do not duplicate the provider inventory here.
