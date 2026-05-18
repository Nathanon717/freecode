# src/providers/router.ts - Routing Logic

**Role:** Selects the provider/model for an agent turn and reports provider availability for CLI status commands.

## Exports

```typescript
route(
  excludeProviders?: string[],
  modelPreference?: string
): Promise<{
  model: LanguageModel;
  providerId: string;
  modelId: string;
  supportsTools: boolean;
}>

testProvider(providerId: string): Promise<{ ok: boolean; error?: string }>

testAllProviders(): Promise<Array<{
  providerId: string;
  providerName: string;
  ok: boolean;
  error?: string;
}>>
```

## Routing Algorithm

```text
loadConfig()
getOllamaModels() when config.useOllama is true

if modelPreference starts with "ollama":
  require config.useOllama
  require cached Ollama availability
  use model after "ollama:" or first detected model
  return supportsTools false

if modelPreference is set:
  parse providerId and optional modelId from providerId:modelId
  require provider exists in registry
  require API key from env or config
  use exact model match, partial model-id match, or first model if no modelId
  return supportsTools based on provider.supportsTools !== false

auto-select:
  iterate registry order
  skip excluded providers
  skip providers without API keys
  return first provider's first model

fallback:
  if Ollama is available, return first Ollama model with supportsTools false

otherwise throw "No providers available"
```

## Tool Support

- Registry providers support tools unless `supportsTools: false`.
- LLM7 is currently marked `supportsTools: false`.
- Ollama always returns `supportsTools: false`.

## Provider Tests

`testProvider()` checks registry presence and API key availability, then creates the OpenAI-compatible provider object. It does not make a provider network call.

`testAllProviders()` checks every registry provider and appends Ollama if `config.useOllama` is true and detected models exist.

## Note

`config.preferLocal` exists in config and the `/config` UI, but the current router does not use it to prefer Ollama before cloud providers.
