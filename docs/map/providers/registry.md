# src/providers/registry.ts - Provider Registry

**Role:** Hardcoded catalog of known cloud providers and their models. It is the source of provider IDs, display names, base URLs, API key env vars, tool support flags, model IDs, and static model limits.

## Exports

```typescript
PROVIDER_REGISTRY: ProviderConfig[]
getProvider(id: string): ProviderConfig | undefined
getAllProviders(): ProviderConfig[]
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

## Key Neighbors

- [router.md](router.md): consumes registry entries for provider selection.
- [config/index.md](../config/index.md): maps provider IDs to config/env keys.
- [providers.md](../../providers.md): generated reference output.

## Update Triggers

Update this page when registry ownership, key consumers, or special-case behavior changes. Do not duplicate the provider inventory here.
