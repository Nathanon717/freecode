# src/providers/provider-catalog.ts - Provider Catalog

**Role:** Static data file containing the `PROVIDER_REGISTRY` array — the catalog of all known cloud providers with their IDs, names, base URLs, API key env vars, blocklists, and static model lists. Nearly pure configuration: the only logic is the free-model predicate, which belongs with the data it reads.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
isFreeModel(provider: ProviderConfig, modelId: string): boolean

selectFreeModels(provider: ProviderConfig, models: ModelConfig[]): ModelConfig[]

PROVIDER_REGISTRY: ProviderConfig[]
```
<!-- END GENERATED EXPORTS -->

## Read When

- Adding, removing, or reordering a provider.
- Changing a provider's base URL, API key env var, blocklist, or static model list.
- Changing which models count as free for a provider.

## Free vs paid

- `isFreeModel(provider, modelId)` is the single answer to "is this billable": a
  `paid` provider serves nothing free, a provider with no `isFreeModelId` predicate
  serves only free models (the free-tier default), and the two that mix — OpenRouter
  (`:free` suffix) and Zen (`-free`, plus one suffixless free model, minus a retired
  one) — carry a predicate on their entry.
- `selectFreeModels` applies it to a list for *discovery*; `resolveModel` gates on
  `isFreeModel` for *access*. Same predicate, deliberately — see
  [paid-guard.md](paid-guard.md).

## Key Neighbors

- [provider-registry.md](provider-registry.md): imports and re-exports `PROVIDER_REGISTRY`; owns all init logic and `resolveModel`.
- [paid-guard.md](paid-guard.md): the `FREECODE_FREE_ONLY` block that consumes `paid` and `isFreeModelId`.
- [types.md](types.md): `ProviderConfig` type consumed here.

## Update Triggers

Update this page when the provider list changes in a structurally significant way (new provider added, removed, or type changed). Do not duplicate the provider inventory here.
