# src/providers/types.ts - Type Definitions

**Role:** Shared interfaces for provider metadata, model metadata, static limits, and loaded config.

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
}

interface ProviderConfig {
  id: string;
  name: string;
  type: 'openai-compat' | 'anthropic';
  baseUrl?: string;
  apiKeyEnvVar: string;
  models: ModelConfig[];
  supportsTools?: boolean;
  paid?: boolean;
  modelsSource?: 'static' | 'live';  // 'live' = model list fetched from provider API at runtime
  modelIdBlocklist?: string[];       // substring filters for live model IDs
  modelIdExactBlocklist?: string[];  // exact filters for live model IDs
}

interface OverridableSettings {
  toolRationale?: boolean;
  showProviderUsage?: boolean;
  parallelTools?: boolean;
}

interface Config {
  providers: Partial<Record<string, { apiKey?: string }>>;
  defaultModel?: string;
  toolRationale: boolean;
  showProviderUsage: boolean;
  toolConfirmation: 'ask' | 'auto';
  parallelTools: boolean;
  providerOverrides?: Record<string, OverridableSettings>;
  modelOverrides?: Record<string, OverridableSettings>;
}
```

## Notes

- `supportsTools` defaults effectively to true; router checks `provider.supportsTools !== false`.
- `baseUrl` is optional because native Anthropic providers use the Anthropic SDK default endpoint.
- `paid` marks providers that should be treated as paid even if other providers are free-tier oriented.
- `modelsSource: 'live'` marks providers whose model list is fetched from the provider API at runtime; used by the model picker to show a `· live` badge next to the provider name.
- `preferredModel` is the startup/default `provider:model` selection used by the CLI.

## Used By

- `providers/registry.ts`: `ProviderConfig`, `ModelConfig`, `RateLimits`
- `providers/adapters/openai-compat.ts`: `ProviderConfig`
- `providers/adapters/anthropic.ts`: `ProviderConfig`
- `config/index.ts`: `Config`
- `commands/config.ts`: `Config`
