# src/providers/ollama.ts - Ollama Detection

**Role:** Detects a local Ollama server, caches its models, and exposes an OpenAI-compatible provider factory.

## Exports

```typescript
detectOllama(): Promise<ModelConfig[]>
getOllamaModels(): Promise<ModelConfig[]>
getOllamaProvider(): ReturnType<typeof createOllamaProvider>
isOllamaAvailable(): boolean
```

## Detection

`detectOllama()` fetches:

```text
http://localhost:11434/api/tags
```

with a 3-second timeout. It returns `[]` for unreachable Ollama, non-OK HTTP responses, or fetch/parse failures, logging details through `logger.ts`.

## Caching

`getOllamaModels()` calls `detectOllama()` only once per process. `isOllamaAvailable()` returns true only after the cache has been populated and contains at least one model.

## Context Window Inference

The context window is guessed from the model name:

| Name contains | Context |
|---------------|---------|
| `70b`, `72b`, `405b`, `235b` | `128000` |
| `14b`, `32n` | `32000` |
| anything else | `8192` |

## Tool Support

The router always returns `supportsTools: false` for Ollama. There is no per-model tool-support detector in the current source.

## Imports

| Symbol | Source |
|--------|--------|
| `ModelConfig` | `./types` |
| `createOllamaProvider` | `./adapters/openai-compat` |
| `log`, `logError` | `../logger` |
