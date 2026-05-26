# src/config/index.ts - Configuration Loader

**Role:** Loads settings/API keys from defaults, global config, local config, and environment variables into one cached `Config` object.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `loadConfig` | `() => Config` | Load and cache merged configuration. |
| `getConfigPaths` | `() => { globalPath: string; localPath: string }` | Return global and local config paths. |
| `readRawConfig` | `(path: string) => Partial<Config> \| null` | Read one JSON config file without merging. |
| `writeConfigFile` | `(path: string, data: Partial<Config>) => void` | Write JSON config and clear the cache. |
| `resolveModelSettings` | `(selectedModel: string) => Required<OverridableSettings>` | Resolve effective settings for a `provider:model` string using model > provider > global priority. |

## Defaults

```typescript
{
  providers: {},
  toolRationale: true,
  showProviderUsage: false,
  toolConfirmation: 'ask',
  parallelTools: true,
}
```

## File Sources

| Source | Path |
|--------|------|
| Global config | `$FREECODE_HOME/config.json`, or `~/.config/freecode/config.json` |
| Local config | `.freecoderc` in `process.cwd()` |

Merge order is defaults, then global file, then local file.

## Provider API Key Merge

For known provider IDs, `loadConfig()` builds a fresh `providers` object:

1. Adds env API key when present.
2. Merges file config for that provider over the env-derived entry.

That means a provider API key in config overrides the same provider's environment key.

## Provider Env Vars

| Provider ID | Env Var |
|-------------|---------|
| `groq` | `GROQ_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `siliconflow` | `SILICONFLOW_API_KEY` |
| `nvidia` | `NVIDIA_API_KEY` |
| `llm7` | `LLM7_API_KEY` |
| `github` | `GITHUB_TOKEN` |
| `cohere` | `COHERE_API_KEY` |
| `ollama` | `OLLAMA_API_KEY` |
| `cerebras` | `CEREBRAS_API_KEY` |
| `mistral` | `MISTRAL_API_KEY` |

## Caching

The first `loadConfig()` call caches the merged object. `writeConfigFile()` resets the cache so the next call re-reads disk/env.
