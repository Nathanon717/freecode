/**
 * @role Loads settings/API keys from defaults, global config, local config, and environment variables into one cached `Config` object.
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { Config, OverridableSettings, ProviderConfig } from '../providers/types.js';
import { log, logError } from '../logger.js';
import { getModelSettings } from '../providers/model-settings-accessor.js';
import { isFreeOnlyMode } from '../providers/paid-guard.js';
import {
  getDbConfigCache,
  setDbConfigCache,
  persistDbConfig,
  registerCacheInvalidator,
  type SyncableGlobalConfig,
} from '../store/db-config-cache.js';
import { writeConfigMirror } from '../store/db.js';
import { readTextFile } from '../util/text-encoding.js';

const SYNCABLE_GLOBAL_KEYS: ReadonlyArray<keyof SyncableGlobalConfig> = [
  'toolRationale', 'showProviderUsage', 'parallelTools', 'toolConfirmation',
  'retryMaxWaitSeconds', 'showEvalDots', 'diffContextLines', 'defaultModel', 'loadAgentsMd',
  'autoApproveTokenBudget',
];

registerCacheInvalidator(() => { cachedConfig = null; });

const DEFAULT_CONFIG: Config = {
  providers: {},
  toolRationale: true,
  showProviderUsage: false,
  toolConfirmation: 'ask',
  parallelTools: true,
  retryMaxWaitSeconds: 120,
  showEvalDots: false,
  diffContextLines: 2,
  loadAgentsMd: false,
  autoApproveTokenBudget: 0,
};

function loadJsonFile<T>(path: string): T | null {
  try {
    if (!existsSync(path)) {
      return null;
    }
    const content = readTextFile(path);
    const parsed = JSON.parse(content) as T;
    log('config', `Loaded`);
    return parsed;
  } catch (err) {
    logError('config', `Failed to load ${path}`, err);
    return null;
  }
}

function getApiKeyFromEnv(providerId: string): string | undefined {
  const envVars: Record<string, string> = {
    groq: 'GROQ_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    siliconflow: 'SILICONFLOW_API_KEY',
    nvidia: 'NVIDIA_API_KEY',
    llm7: 'LLM7_API_KEY',
    github: 'GITHUB_TOKEN',
    cohere: 'COHERE_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    cloudflare: 'CLOUDFLARE_API_KEY',
    zai: 'ZAI_API_KEY',
    zen: 'OPENCODE_ZEN_API_KEY',
    huggingface: 'HF_TOKEN',
  };
  
  const envVar = envVars[providerId];
  if (envVar) {
    return process.env[envVar];
  }
  return undefined;
}

export function getConfigDir(): string {
  return process.env.FREECODE_HOME ?? join(homedir(), '.config', 'freecode');
}

export function resolveApiKey(provider: ProviderConfig): string | undefined {
  // Report no key for a paid provider in free-only mode, which hides it from the
  // picker and stops model discovery fetching it. This is the layer that catches a
  // key exported in the user's own shell rather than injected from Doppler — see
  // providers/paid-guard.ts. resolveModel refuses these outright as well.
  if (provider.paid && isFreeOnlyMode()) return undefined;
  return process.env[provider.apiKeyEnvVar] || loadConfig().providers[provider.id]?.apiKey || provider.defaultApiKey || undefined;
}

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;
  let config = { ...DEFAULT_CONFIG };

  const configDir = getConfigDir();
  const globalConfigPath = join(configDir, 'config.json');
  const globalConfig = loadJsonFile<Partial<Config>>(globalConfigPath);
  if (globalConfig) {
    config = { ...config, ...globalConfig };
  }

  // DB cache wins over config.json for syncable settings (cross-device source of truth).
  // Local .freecoderc (applied below) still wins over DB.
  const dbCache = getDbConfigCache();
  if (dbCache) {
    if (dbCache.global !== null) {
      for (const key of SYNCABLE_GLOBAL_KEYS) {
        const val = dbCache.global[key];
        if (val !== undefined) (config as Record<string, unknown>)[key] = val;
      }
    }
    if (dbCache.providerOverrides !== null) {
      config.providerOverrides = Object.keys(dbCache.providerOverrides).length > 0
        ? dbCache.providerOverrides
        : undefined;
    }
  }

  const localConfigPath = join(process.cwd(), '.freecoderc');
  const localConfig = loadJsonFile<Partial<Config>>(localConfigPath);
  if (localConfig) {
    config = { ...config, ...localConfig };
  }
  delete (config as Record<string, unknown>)['preferLocal'];
  
  const configuredProviders: Config['providers'] = {};
  const providerIds = ['groq', 'openrouter', 'siliconflow', 'nvidia', 'llm7', 'github', 'cohere', 'cerebras', 'mistral', 'openai', 'anthropic', 'cloudflare', 'zai', 'zen', 'huggingface'] as const;
  
  for (const providerId of providerIds) {
    const apiKey = getApiKeyFromEnv(providerId);
    if (apiKey) {
      configuredProviders[providerId] = { apiKey };
    }

    if (config.providers[providerId]?.apiKey) {
      configuredProviders[providerId] = {
        ...configuredProviders[providerId],
        ...config.providers[providerId],
      };
    }
  }

  config.providers = configuredProviders;
  cachedConfig = config;
  return config;
}

export function getConfigPaths(): { globalPath: string; localPath: string } {
  const configDir = getConfigDir();
  return {
    globalPath: join(configDir, 'config.json'),
    localPath: join(process.cwd(), '.freecoderc'),
  };
}

/** One JSON config file, read without merging — `model-data.ts` uses it for legacy migration. */
export function readRawConfig(path: string): Partial<Config> | null {
  return loadJsonFile<Partial<Config>>(path);
}

/**
 * `overridesAuthoritative` marks a write that intends to change providerOverrides
 * (only the config UI's override editor does). Every other write carries whatever
 * config.json happened to hold, which may be a stale subset of the DB's copy.
 *
 * Clears the in-memory cache, so the next `loadConfig()` re-reads disk.
 */
export function writeConfigFile(path: string, data: Partial<Config>, overridesAuthoritative = false): void {
  delete (data as Record<string, unknown>)['preferLocal'];
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  cachedConfig = null;

  // Sync syncable fields to the DB when writing the global config file.
  const { globalPath } = getConfigPaths();
  if (path === globalPath) {
    const raw = data as Record<string, unknown>;
    const syncableGlobal: SyncableGlobalConfig = {};
    for (const key of SYNCABLE_GLOBAL_KEYS) {
      const val = raw[key];
      if (val !== undefined) (syncableGlobal as Record<string, unknown>)[key] = val;
    }
    const existingCache = getDbConfigCache() ?? { global: null, providerOverrides: null };
    // An authoritative write replaces the DB copy outright, so clearing an override
    // still works. Otherwise the DB wins; the file's copy only promotes when no DB
    // row exists yet (overrides predating the sync).
    const fileOverrides = data.providerOverrides;
    const newProviderOverrides = overridesAuthoritative
      ? fileOverrides ?? {}
      : existingCache.providerOverrides ?? fileOverrides ?? {};
    const newGlobal: SyncableGlobalConfig = { ...(existingCache.global ?? {}), ...syncableGlobal };
    const newData = { global: newGlobal, providerOverrides: newProviderOverrides };
    setDbConfigCache(newData);
    writeConfigMirror(newData);
    persistDbConfig('global', newGlobal);
    persistDbConfig('providerOverrides', newProviderOverrides);
  }
}

export function updateGlobalConfig(patch: Record<string, unknown>): void {
  const { globalPath } = getConfigPaths();
  const existing = (readRawConfig(globalPath) as Record<string, unknown>) ?? {};
  delete existing['preferLocal'];
  writeConfigFile(globalPath, { ...existing, ...patch });
}

export function saveDefaultModel(model: string): void {
  updateGlobalConfig({ defaultModel: model });
}

/**
 * Apply the model > provider > global priority cascade. The cascade uses `??`,
 * not `||`: `autoApproveTokenBudget` is numeric and `0` is meaningful
 * (auto-approve off), so an override of `0` must beat a non-zero parent rather
 * than falling through to it.
 */
export function resolveModelSettings(selectedModel: string): Required<OverridableSettings> {
  const config = loadConfig();
  const colonIdx = selectedModel.indexOf(':');
  const providerId = colonIdx !== -1 ? selectedModel.slice(0, colonIdx) : '';

  const global = {
    toolRationale: config.toolRationale,
    showProviderUsage: config.showProviderUsage,
    parallelTools: config.parallelTools,
    loadAgentsMd: config.loadAgentsMd,
    autoApproveTokenBudget: config.autoApproveTokenBudget,
  };

  const providerOver = providerId ? config.providerOverrides?.[providerId] : undefined;
  const modelSettings = getModelSettings(selectedModel);

  return {
    toolRationale: modelSettings.toolRationale ?? providerOver?.toolRationale ?? global.toolRationale,
    showProviderUsage: modelSettings.showProviderUsage ?? providerOver?.showProviderUsage ?? global.showProviderUsage,
    parallelTools: modelSettings.parallelTools ?? providerOver?.parallelTools ?? global.parallelTools,
    loadAgentsMd: modelSettings.loadAgentsMd ?? providerOver?.loadAgentsMd ?? global.loadAgentsMd,
    parsedTools: modelSettings.parsedTools ?? false,
    // `??` throughout: 0 is a meaningful value here (auto-approve off), so an
    // override of 0 must beat a non-zero parent rather than falling through.
    autoApproveTokenBudget:
      modelSettings.autoApproveTokenBudget
      ?? providerOver?.autoApproveTokenBudget
      ?? global.autoApproveTokenBudget,
  };
}
