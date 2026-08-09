# src/providers/provider-catalog.ts - Provider Catalog

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Static data file containing the `PROVIDER_REGISTRY` array — the catalog of all known cloud providers with their IDs, names, base URLs, API key env vars, blocklists, and static model lists. Nearly pure configuration: the only logic is the free-model predicate, which belongs with the data it reads.

## Read When

- Adding, removing, or reordering a provider.
- Changing a provider's base URL, API key env var, blocklist, or static model list.
- Changing which models count as free for a provider.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Whether a model is free to call. A provider with no `isFreeModelId` predicate
 * serves only free models (the free-tier default); a `paid` provider serves none.
 */
isFreeModel(provider: ProviderConfig, modelId: string): boolean

selectFreeModels(provider: ProviderConfig, models: ModelConfig[]): ModelConfig[]

PROVIDER_REGISTRY: ProviderConfig[]
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/types.ts`](types.md) ×5
- **Imported by:** [`providers/provider-registry.ts`](provider-registry.md) ×14

## Tests

`tests/providers/provider-catalog.test.ts`. 1 other test file references it.

## Budget

330 / 500 lines (170 to spare).

## Env

`CLOUDFLARE_ACCOUNT_ID`
<!-- END GENERATED MAP FACTS -->

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
