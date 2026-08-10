# src/providers/types.ts - Type Definitions

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Shared interfaces for provider metadata, model metadata, static limits, and loaded config.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface RateLimits {
  rpm: number;
  rpd: number;
  tpm: number;
  tpd: number | null;
}

interface ModelConfig {
  id: string;
  displayName: string;
  contextWindow?: number;
  limits?: RateLimits;
  isNew?: boolean;
}

interface ProviderConfig {
  id: string;
  name: string;
  baseUrl?: string;
  apiKeyEnvVar: string;
  defaultApiKey?: string;
  models: ModelConfig[];
  supportsTools?: boolean;
  paid?: boolean;
  /**
   * Set on providers that serve free AND paid models behind one key, to say which
   * model ids are the free ones. It is the single definition of that: model
   * discovery filters the picker with it, and `resolveModel` gates on it under
   * `FREECODE_FREE_ONLY=1` (see providers/paid-guard.ts). A provider with no
   * predicate is treated as free throughout — that is the free-tier default.
   */
  isFreeModelId?: (modelId: string) => boolean;
  modelsSource?: 'static' | 'live';
  modelIdBlocklist?: string[];
  modelIdExactBlocklist?: string[];
  modelTierBlocklist?: string[];
}

interface OverridableSettings {
  toolRationale?: boolean;
  showProviderUsage?: boolean;
  parallelTools?: boolean;
  loadAgentsMd?: boolean;
  parsedTools?: boolean;
  autoApproveTokenBudget?: number;
}

interface Config {
  providers: Partial<Record<string, { apiKey?: string }>>;
  defaultModel?: string;
  toolRationale: boolean;
  showProviderUsage: boolean;
  toolConfirmation: 'ask' | 'auto';
  parallelTools: boolean;
  providerOverrides?: Record<string, OverridableSettings>;
  retryMaxWaitSeconds: number;
  showEvalDots: boolean;
  diffContextLines: number;
  loadAgentsMd: boolean;
  /** Auto-approve read-only tool calls costing fewer than this many tokens. 0 = off. */
  autoApproveTokenBudget: number;
}
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`providers/provider-registry.ts`](provider-registry.md) ×12, [`config/index.ts`](../config/index.md) ×11, [`commands/config.ts`](../commands/config.md) ×6, [`providers/index.ts`](index.md) ×5, [`providers/provider-catalog.ts`](provider-catalog.md) ×5, [`providers/model-data.ts`](model-data.md) ×3, [`providers/model-settings-accessor.ts`](model-settings-accessor.md) ×2, [`cli/menus/model-screen.ts`](../cli/menus/model-screen.md) ×1, +2 more

## Tests

No mirrored test — pure type declarations; erased at compile time, no runtime behavior to test. 2 other test files reference it.

## Budget

63 / 500 lines (437 to spare).
<!-- END GENERATED MAP FACTS -->

## Notes

- `supportsTools` defaults effectively to true; router checks `provider.supportsTools !== false`.
- `paid` marks providers that should be treated as paid even if other providers are free-tier oriented. It is no longer only a label: under `FREECODE_FREE_ONLY=1` it suppresses the provider's API key and refuses its models outright ([paid-guard.md](paid-guard.md)).
- `isFreeModelId` is set only on providers that mix free and paid models behind one key (OpenRouter, Zen). Absent means "all free" — the free-tier default. It is the same predicate for discovery and for the access gate; see [provider-catalog.md](provider-catalog.md).
- `modelsSource: 'live'` marks providers whose model list is fetched from the provider API at runtime; used by the model picker to show a `· live` badge next to the provider name.
- `preferredModel` is the startup/default `provider:model` selection used by the CLI.
- Favorites and per-model settings are **not** config fields — they live in the git-tracked model store (`providers/model-data.ts`), not `config.json`. `modelOverrides` was removed in Phase 3 of the model-store redesign.
- `providerOverrides` remains in `Config` (written to `config.json`).
