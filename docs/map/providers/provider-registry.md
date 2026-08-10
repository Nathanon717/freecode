# src/providers/provider-registry.ts - Provider Registry

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Catalog of known cloud providers and their models. Source of provider IDs, display names, base URLs, API key env vars, tool support flags, model IDs, static model limits, and live-fetch init logic.

## Read When

- Adding, removing, or reordering a provider.
- Changing model IDs, display names, API key env vars, tool support, paid status, static limits, or where display names and context windows come from.
- Debugging router selection where registry order or provider metadata matters.

For the generated provider table, see [providers.md](../../providers.md).
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
PROVIDER_REGISTRY: ProviderConfig[]

initDynamicProviders(): Promise<void>

getProvider(id: string): ProviderConfig | undefined

clearModelNewFlag(providerId: string, modelId: string): void

/**
 * Permanently blocklist a model for this user: persist the key and drop it from the
 * live registry so the running session stops offering it immediately. `_doInit` applies
 * the same filter on every later launch. The caller owns deleting the DB rows.
 */
blocklistModelPermanently(providerId: string, modelId: string): void

retireDeadModel(providerId: string, modelId: string): void

interface ResolvedModel {
  model: LanguageModel;
  providerId: string;
  modelId: string;
  supportsTools: boolean;
}

resolveModel(modelPreference: string): ResolvedModel
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/fake.ts`](fake.md) ×15, [`providers/provider-catalog.ts`](provider-catalog.md) ×14, [`providers/types.ts`](types.md) ×12, [`config/index.ts`](../config/index.md) ×5, [`store/model-list-cache.ts`](../store/model-list-cache.md) ×4, [`providers/model-data.ts`](model-data.md) ×3, [`providers/paid-guard.ts`](paid-guard.md) ×3, [`providers/user-blocklist.ts`](user-blocklist.md) ×3, [`logger.ts`](../logger.md) ×2, [`providers/adapters/openai-compat.ts`](adapters/openai-compat.md) ×1
- **Imported by:** [`providers/index.ts`](index.md) ×8, [`commands/model.ts`](../commands/model.md) ×4, [`agent/loop.ts`](../agent/loop.md) ×2, [`cli/command-dispatcher.ts`](../cli/command-dispatcher.md) ×1, [`cli/eval/custom-eval-menu.ts`](../cli/eval/custom-eval-menu.md) ×1, [`commands/status.ts`](../commands/status.md) ×1

## Tests

`tests/providers/provider-registry.test.ts`. 3 other test files reference it.

## Budget

455 / 500 lines (45 to spare).
<!-- END GENERATED MAP FACTS -->

## Special Cases

- LLM7 has `supportsTools: false`, so `agentLoop()` does not pass tools to that model.
- OpenAI has `paid: true`; uses the standard OpenAI-compatible adapter against `api.openai.com/v1`.
- Anthropic has `paid: true` and is an ordinary catalog entry — `baseUrl: "https://api.anthropic.com/v1"` routed through `createOpenAICompatProvider`, the same adapter as every other provider. There is no separate Anthropic adapter. It's in `LIVE_PROVIDER_IDS` and fetched through the generic `initProviderModels`, whose model mapper falls back to `display_name` when `name` is absent (Anthropic's `/v1/models` labels models `display_name`).
- Cloudflare Workers AI uses a `baseUrl` templated from `process.env.CLOUDFLARE_ACCOUNT_ID` at module load time; requires both `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_KEY` env vars.
- Ollama is not in `PROVIDER_REGISTRY`; `createOllamaProvider()` lives in [adapters/openai-compat.md](adapters/openai-compat.md).
- Providers with `modelsSource: 'live'` have their model list fetched from the provider's `/v1/models` API at runtime via `initDynamicProviders()`. Most live providers start empty and use the cache from `model-list-cache.ts` on fetch failure; Zen keeps a curated current-free seed list for offline/default picker availability. All live fetches are gated on `resolveApiKey(provider)`, so env vars, default keys, and config-file keys enable discovery; if no key is configured, the fetch is skipped entirely.
- `initDynamicProviders()` is memoized via a module-level `initPromise`: all callers share the same underlying `Promise.all`. `getSelectableModels()` is called in the background at interactive startup (suppressed by `FREECODE_NO_PREFETCH=1` in the TTY test harness), so a later `/model` open awaits an already-in-flight or completed fetch rather than starting a new one.
- `mock:*` models are virtual and are not listed in `PROVIDER_REGISTRY`. `resolveModel()` only accepts them when `FREECODE_FAKE_LLM=1`, and fake mode rejects real provider resolution plus live model discovery.
- After fetching, live-provider model lists are deduplicated by `displayName`: when multiple IDs resolve to the same name (aliases), the versioned ID (date-stamped or semver) is kept and aliases are dropped.
- Live providers can use `modelIdBlocklist` for substring filters and `modelIdExactBlocklist` for exact ID filters before models are displayed. OpenAI uses the exact filter for `chat-latest` so versioned `*-chat-latest` models remain visible.
- The **user blocklist** ([user-blocklist.md](user-blocklist.md)) is applied in two places, both *before* the relevant catalog write so a permanently removed model never earns a `models` row again: (1) live providers strip it in `runLiveProviderInit`'s `finish()`, alongside the registry blocklist, before their in-init `saveProviderCatalog`; (2) `_doInit` then strips it across *every* provider before the static-provider catalog write, since static providers never run a live init and would otherwise let a model come straight back from the catalog. (Before the fix in `docs/bug log/21-07-2026.md` only step 2 existed, and it ran *after* live init had already re-written the blocklisted rows, so a fully removed model kept coming back.) `blocklistModelPermanently()` is the runtime counterpart (persist the key, then strip it from the live registry so the current session stops offering it immediately); it mirrors `retireDeadModel`, but the caller owns deleting the DB rows.
- **Free-model filtering is one predicate, used twice.** Zen and OpenRouter both serve free and paid models behind one key, so each carries an `isFreeModelId` on its catalog entry ([provider-catalog.md](provider-catalog.md) — Zen's covers the retired free-period IDs and the one suffixless free model; OpenRouter's is the `:free` suffix). `selectModels` filters *discovery* with it, and `resolveModel` **gates** on it under `FREECODE_FREE_ONLY=1`. Keeping them the same definition is the point: the filter used to live only in `selectModels`, which shaped the picker list and nothing else, so `--model openrouter:anthropic/claude-opus-4.5` resolved and billed anyway.
- **`resolveModel` is where paid access is refused**, beside the existing `isFakeLlmMode` block and before the key lookup. It is the funnel every path reaches, including the three that never see the picker's list: `--model`, `FREECODE_MODEL`, and a persisted `defaultModel`. See [paid-guard.md](paid-guard.md) for the layering and the threat model.
- `initDynamicProviders` calls `updateProviderCache` on every successful fetch to persist results and detect new/removed models.

## Catalog Writes

Every successful live init writes the provider's final model list to the `models` table via
`saveProviderCatalog`, and `_doInit` does the same for static providers afterwards (the
change check makes the repeat a no-op). When a fetch fails, the model list is rebuilt from
`getProviderCatalog` — the DB, not `model-cache.json`, which holds ids only.

`runLiveProviderInit`'s `finish()` applies the registry blocklist (substring + exact) **and**
the user blocklist centrally, before the catalog write, so blocklisted models never reach the
DB regardless of whether the provider's own `selectModels` filters (openrouter does not).
