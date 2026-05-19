# src/providers/router.ts - Routing Logic

**Role:** Selects the provider/model for an agent turn and reports provider availability for CLI status commands.

## Exports

```typescript
route(
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

## Read When

- Changing provider/model preference parsing.
- Debugging auto-selection order or Ollama fallback.
- Updating provider availability checks used by `/keys`, `--test`, or `--test-all`.

## Key Neighbors

- [registry.md](registry.md): provider order, metadata, tool support, and model IDs.
- [ollama.md](ollama.md): local model detection and cache.
- [adapters/openai-compat.md](adapters/openai-compat.md) and [adapters/anthropic.md](adapters/anthropic.md): provider construction.
- [config/index.md](../config/index.md): API key and router-related config.

## Update Triggers

Update this page when routing inputs/outputs, selection order, or provider-test ownership changes.
