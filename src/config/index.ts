import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { Config } from '../providers/types.js';
import { log, logError } from '../logger.js';

const DEFAULT_CONFIG: Config = {
  providers: {},
  useOllama: true,
  toolRationale: true,
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
    ollama: 'OLLAMA_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
  };
  
  const envVar = envVars[providerId];
  if (envVar) {
    return process.env[envVar];
  }
  return undefined;
}

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;
  let config = { ...DEFAULT_CONFIG };
  
  const configDir = process.env.FREECODE_HOME ?? join(homedir(), '.config', 'freecode');
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
  const providerIds = ['groq', 'openrouter', 'siliconflow', 'nvidia', 'llm7', 'github', 'cohere', 'cerebras', 'mistral', 'openai', 'anthropic'];
  
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
  const configDir = process.env.FREECODE_HOME ?? join(homedir(), '.config', 'freecode');
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
