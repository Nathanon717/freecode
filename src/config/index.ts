import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { Config, OverridableSettings, ProviderConfig } from '../providers/types.js';
import { log, logError } from '../logger.js';

const DEFAULT_CONFIG: Config = {
  providers: {},
  toolRationale: true,
  showProviderUsage: false,
  toolConfirmation: 'ask',
  parallelTools: true,
  retryMaxWaitSeconds: 10,
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
  return process.env[provider.apiKeyEnvVar] || loadConfig().providers[provider.id]?.apiKey || undefined;
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
  
  const localConfigPath = join(process.cwd(), '.freecoderc');
  const localConfig = loadJsonFile<Partial<Config>>(localConfigPath);
  if (localConfig) {
    config = { ...config, ...localConfig };
  }
  delete (config as Record<string, unknown>)['preferLocal'];
  
  const configuredProviders: Config['providers'] = {};
  const providerIds = ['groq', 'openrouter', 'siliconflow', 'nvidia', 'llm7', 'github', 'cohere', 'cerebras', 'mistral', 'openai', 'anthropic', 'cloudflare', 'zai'] as const;
  
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
}

export function resolveModelSettings(selectedModel: string): Required<OverridableSettings> {
  const config = loadConfig();
  const colonIdx = selectedModel.indexOf(':');
  const providerId = colonIdx !== -1 ? selectedModel.slice(0, colonIdx) : '';

  const global = {
    toolRationale: config.toolRationale,
    showProviderUsage: config.showProviderUsage,
    parallelTools: config.parallelTools,
  };

  const providerOver = providerId ? config.providerOverrides?.[providerId] : undefined;
  const modelOver = config.modelOverrides?.[selectedModel];

  return {
    toolRationale: modelOver?.toolRationale ?? providerOver?.toolRationale ?? global.toolRationale,
    showProviderUsage: modelOver?.showProviderUsage ?? providerOver?.showProviderUsage ?? global.showProviderUsage,
    parallelTools: modelOver?.parallelTools ?? providerOver?.parallelTools ?? global.parallelTools,
  };
}
