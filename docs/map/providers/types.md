# src/providers/types.ts - Type Definitions

**Role:** Shared interfaces for provider metadata, model metadata, static limits, and loaded config.

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
  type: 'openai-compat' | 'anthropic';
  baseUrl?: string;
  apiKeyEnvVar: string;
  defaultApiKey?: string;
  models: ModelConfig[];
  supportsTools?: boolean;
  paid?: boolean;
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
}
```
<!-- END GENERATED EXPORTS -->

## Notes

- `supportsTools` defaults effectively to true; router checks `provider.supportsTools !== false`.
- `baseUrl` is optional because native Anthropic providers use the Anthropic SDK default endpoint.
- `paid` marks providers that should be treated as paid even if other providers are free-tier oriented.
- `modelsSource: 'live'` marks providers whose model list is fetched from the provider API at runtime; used by the model picker to show a `· live` badge next to the provider name.
- `preferredModel` is the startup/default `provider:model` selection used by the CLI.
- Favorites and per-model settings are **not** config fields — they live in the git-tracked model store (`providers/model-store.ts`), not `config.json`. `modelOverrides` was removed in Phase 3 of the model-store redesign.
- `providerOverrides` remains in `Config` (written to `config.json`).

## Used By

- `providers/registry.ts`: `ProviderConfig`, `ModelConfig`, `RateLimits`
- `providers/adapters/openai-compat.ts`: `ProviderConfig`
- `providers/adapters/anthropic.ts`: `ProviderConfig`
- `config/index.ts`: `Config`
- `commands/config.ts`: `Config`
