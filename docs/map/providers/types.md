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
  type: 'openai-compat';
  baseUrl: string;
  apiKeyEnvVar: string;
  models: ModelConfig[];
  supportsTools?: boolean;
}

interface Config {
  providers: Partial<Record<string, { apiKey?: string; preferredModel?: string }>>;
  preferLocal: boolean;
  useOllama: boolean;
  toolRationale: boolean;
}
```

## Notes

- `supportsTools` defaults effectively to true; router checks `provider.supportsTools !== false`.
- `preferLocal` is part of config and editable through `/config`, but current router logic does not use it.
- `preferredModel` is accepted in config shape but current routing is driven by explicit model preference or registry defaults.

## Used By

- `providers/registry.ts`: `ProviderConfig`, `ModelConfig`, `RateLimits`
- `providers/ollama.ts`: `ModelConfig`
- `providers/adapters/openai-compat.ts`: `ProviderConfig`
- `config/index.ts`: `Config`
- `commands/config.ts`: `Config`
