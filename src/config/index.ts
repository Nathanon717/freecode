import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { Config, OverridableSettings, ProviderConfig } from '../providers/types.js';
import { log, logError } from '../logger.js';
import { getModelSettings } from '../providers/model-settings-registry.js';
import {
  getDbConfigCache,
  setDbConfigCache,
  persistDbConfig,
  registerCacheInvalidator,
  type SyncableGlobalConfig,
} from '../providers/db-config-cache.js';
import { writeConfigMirror } from '../providers/db.js';

const SYNCABLE_GLOBAL_KEYS: ReadonlyArray<keyof SyncableGlobalConfig> = [
  'toolRationale', 'showProviderUsage', 'parallelTools', 'toolConfirmation',
  'retryMaxWaitSeconds', 'showEvalDots', 'diffContextLines', 'defaultModel', 'loadAgentsMd',
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
};

function loadJsonFile<T>(path: string): T | null {
  try {
    if (!existsSync(path)) {
      return null;
    }
    const content = readFileSync(path, 'utf-8');
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

export function readRawConfig(path: string): Partial<Config> | null {
  return loadJsonFile<Partial<Config>>(path);
}

export function writeConfigFile(path: string, data: Partial<Config>): void {
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
    const newProviderOverrides = (data.providerOverrides as Record<string, OverridableSettings>) ?? {};
    const existingCache = getDbConfigCache() ?? { global: null, providerOverrides: null };
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

export function resolveModelSettings(selectedModel: string): Required<OverridableSettings> {
  const config = loadConfig();
  const colonIdx = selectedModel.indexOf(':');
  const providerId = colonIdx !== -1 ? selectedModel.slice(0, colonIdx) : '';

  const global = {
    toolRationale: config.toolRationale,
    showProviderUsage: config.showProviderUsage,
    parallelTools: config.parallelTools,
    loadAgentsMd: config.loadAgentsMd,
  };

  const providerOver = providerId ? config.providerOverrides?.[providerId] : undefined;
  const modelSettings = getModelSettings(selectedModel);

  return {
    toolRationale: modelSettings.toolRationale ?? providerOver?.toolRationale ?? global.toolRationale,
    showProviderUsage: modelSettings.showProviderUsage ?? providerOver?.showProviderUsage ?? global.showProviderUsage,
    parallelTools: modelSettings.parallelTools ?? providerOver?.parallelTools ?? global.parallelTools,
    loadAgentsMd: modelSettings.loadAgentsMd ?? providerOver?.loadAgentsMd ?? global.loadAgentsMd,
    parsedTools: modelSettings.parsedTools ?? false,
  };
}
