# src/config/index.ts - Configuration Loader

**Role:** Loads settings/API keys from defaults, global config, local config, and environment variables into one cached `Config` object.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
getConfigDir(): string

resolveApiKey(provider: ProviderConfig): string | undefined

loadConfig(): Config

getConfigPaths(): { globalPath: string; localPath: string; }

readRawConfig(path: string): Partial<Config> | null

/**
 * `overridesAuthoritative` marks a write that intends to change providerOverrides
 * (only the config UI's override editor does). Every other write carries whatever
 * config.json happened to hold, which may be a stale subset of the DB's copy.
 */
writeConfigFile(path: string, data: Partial<Config>, overridesAuthoritative?: boolean): void

updateGlobalConfig(patch: Record<string, unknown>): void

saveDefaultModel(model: string): void

resolveModelSettings(selectedModel: string): Required<OverridableSettings>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/types.ts`](../providers/types.md) ×11, [`store/db-config-cache.ts`](../store/db-config-cache.md) ×9, [`logger.ts`](../logger.md) ×2, [`providers/model-settings-accessor.ts`](../providers/model-settings-accessor.md) ×1, [`providers/paid-guard.ts`](../providers/paid-guard.md) ×1, [`store/db.ts`](../store/db.md) ×1, [`util/text-encoding.ts`](../util/text-encoding.md) ×1
- **Imported by:** [`commands/config.ts`](../commands/config.md) ×8, [`providers/provider-registry.ts`](../providers/provider-registry.md) ×5, [`commands/model.ts`](../commands/model.md) ×3, [`agent/loop.ts`](../agent/loop.md) ×2, [`cli/command-dispatcher.ts`](../cli/command-dispatcher.md) ×2, [`cli/session-modes.ts`](../cli/session-modes.md) ×2, [`providers/adapters/openai-compat.ts`](../providers/adapters/openai-compat.md) ×2, [`providers/quota/cache.ts`](../providers/quota/cache.md) ×2, +4 more

## Tests

`tests/config/index.test.ts`. 7 other test files reference it.

## Budget

244 / 500 lines (256 to spare).

## Env

`FREECODE_HOME`
<!-- END GENERATED MAP FACTS -->

## Export notes

- `readRawConfig`: reads one JSON config file without merging (used by model-data for legacy migration).
- `writeConfigFile`: writes JSON config and clears the in-memory cache so the next `loadConfig()` re-reads disk.
- `resolveModelSettings`: applies model > provider > global priority cascade. The cascade uses `??`, not `||` — `autoApproveTokenBudget` is numeric and `0` is a meaningful value (auto-approve off), so an override of `0` must beat a non-zero parent rather than falling through to it.

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

**`resolveApiKey` reports no key at all for a `paid` provider when `FREECODE_FREE_ONLY=1`**, ahead of every source. That hides the provider from the picker and stops model discovery fetching it, and it is the layer that catches a key exported in the user's own shell rather than injected from Doppler. See [../providers/paid-guard.md](../providers/paid-guard.md) for the other two layers.

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

## DB Sync for Global and Provider Settings

Global config settings (all syncable scalars in `Config`) and `providerOverrides` are now synced cross-device via the `config` DB table. On `loadConfig()`, the DB cache ([providers/db-config-cache.md](../store/db-config-cache.md)) is merged after `config.json` but before `.freecoderc`, so DB wins over the global file and `.freecoderc` wins over everything. On every `writeConfigFile()` call to the global path, syncable fields are extracted (whitelisted — no API keys), the in-memory cache is updated synchronously, and a fire-and-forget DB write is dispatched via `persistDbConfig`. Model-level settings are unaffected (still owned by model-data).

## Favorites and Model Settings Moved Out

Favorites and per-model setting overrides are no longer stored here. The old `loadFavorites`/`saveFavorites` helpers and `Config.modelOverrides` field were removed; both now live in the git-tracked model store ([providers/model-data.md](../providers/model-data.md)). `getConfigPaths`/`readRawConfig` are still used by the store to read legacy values once during migration. `resolveModelSettings` reads model-level settings via `getModelSettings` from [providers/model-settings-accessor.md](../providers/model-settings-accessor.md) (not directly from `model-data.ts`) and falls back to `providerOverrides` then global config.
