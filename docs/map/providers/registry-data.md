# src/providers/registry-data.ts - Provider Registry Data

**Role:** Static data file containing the `PROVIDER_REGISTRY` array — the catalog of all known cloud providers with their IDs, names, base URLs, API key env vars, blocklists, and static model lists. No logic; pure configuration.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
PROVIDER_REGISTRY: ProviderConfig[]
```
<!-- END GENERATED EXPORTS -->

## Read When

- Adding, removing, or reordering a provider.
- Changing a provider's base URL, API key env var, blocklist, or static model list.

## Key Neighbors

- [registry.md](registry.md): imports and re-exports `PROVIDER_REGISTRY`; owns all init logic and `resolveModel`.
- [types.md](types.md): `ProviderConfig` type consumed here.

## Update Triggers

Update this page when the provider list changes in a structurally significant way (new provider added, removed, or type changed). Do not duplicate the provider inventory here.
