import type { LanguageModel } from 'ai';
import { getAllProviders, getProvider } from './registry.js';
import chalk from 'chalk';
import { getOllamaModels, getOllamaProvider, isOllamaAvailable } from './ollama.js';
import { createOpenAICompatProvider } from './adapters/openai-compat.js';
import { createAnthropicProvider } from './adapters/anthropic.js';
import type { ProviderConfig } from './types.js';
import { loadConfig } from '../config/index.js';
import { log } from '../logger.js';

function buildModel(provider: ProviderConfig, modelId: string): LanguageModel {
  if (provider.type === 'anthropic') {
    return createAnthropicProvider(provider)(modelId) as LanguageModel;
  }
  return createOpenAICompatProvider(provider)(modelId) as LanguageModel;
}

function logSelection(provider: ProviderConfig, modelId: string): void {
  if (provider.paid) {
    console.log(chalk.yellow.bold(`\n⚠  PAID PROVIDER — charges apply to your ${provider.name} account`));
  }
  console.log(chalk.dim(`[using ${provider.id}:${modelId}]\n`));
}

export async function route(
  modelPreference?: string
): Promise<{ model: LanguageModel; providerId: string; modelId: string; supportsTools: boolean }> {
  const config = loadConfig();
  const ollamaModels = config.useOllama ? await getOllamaModels() : [];
  const ollamaAvailable = config.useOllama && isOllamaAvailable();

  if (modelPreference?.startsWith('ollama')) {
    log('router', 'Preference targets Ollama');
    if (!config.useOllama) {
      throw new Error('Ollama is disabled (useOllama: false in config)');
    }
    if (ollamaAvailable) {
      const ollama = getOllamaProvider();
      const modelId = modelPreference.replace(/^ollama:/, '') || ollamaModels[0]?.id;
      if (modelId) {
        log('router', `Routed to ollama:${modelId}`);
        return {
          model: ollama(modelId),
          providerId: 'ollama',
          modelId,
          supportsTools: false,
        };
      }
      log('router', 'Ollama available but no matching model found');
    } else {
      log('router', 'Ollama preference requested but Ollama is not available');
    }
    throw new Error('Ollama not available or model not found');
  }

  if (modelPreference) {
    const [providerId, ...modelParts] = modelPreference.includes(':')
      ? modelPreference.split(':')
      : [modelPreference, ''];
    const modelId = modelParts.join(':');
    const provider = getProvider(providerId);
    if (!provider) {
      log('router', `Provider not found in registry: ${providerId}`);
    } else {
      const apiKey = process.env[provider.apiKeyEnvVar] || config.providers[provider.id]?.apiKey;
      if (!apiKey) {
        log('router', `No API key for ${providerId}`);
      } else {
        const targetModel = modelId
          ? provider.models.find(m => m.id === modelId || m.id.includes(modelId))
          : provider.models[0];
        if (!targetModel) {
          log('router', `Model not found in ${providerId}`, { wanted: modelId, available: provider.models.map(m => m.id) });
        } else {
          logSelection(provider, targetModel.id);
          log('router', `Routed to ${provider.id}:${targetModel.id} (supportsTools=${provider.supportsTools !== false})`);
          return {
            model: buildModel(provider, targetModel.id),
            providerId: provider.id,
            modelId: targetModel.id,
            supportsTools: provider.supportsTools !== false,
          };
        }
      }
    }
    throw new Error(`Provider ${providerId} not available or not configured`);
  }

  log('router', 'Auto-selecting provider (scanning registry)');
  for (const provider of getAllProviders()) {
    const apiKey = process.env[provider.apiKeyEnvVar] || config.providers[provider.id]?.apiKey;
    if (!apiKey) {
      log('router', `Skipping ${provider.id} — no API key`);
      continue;
    }

    const targetModel = provider.models[0];
    log('router', `Trying ${provider.id}:${targetModel.id}`);

    try {
      const model = buildModel(provider, targetModel.id);
      logSelection(provider, targetModel.id);
      log('router', `Routed to ${provider.id}:${targetModel.id}`);
      return {
        model,
        providerId: provider.id,
        modelId: targetModel.id,
        supportsTools: provider.supportsTools !== false,
      };
    } catch (err) {
      log('router', `Failed to create provider ${provider.id}`, { error: err instanceof Error ? err.message : String(err) });
      continue;
    }
  }

  if (ollamaAvailable) {
    const modelId = ollamaModels[0]?.id;
    if (modelId) {
      const ollama = getOllamaProvider();
      console.log(chalk.dim(`[using ollama:${modelId}]\n`));
      log('router', `Falling back to ollama:${modelId}`);
      return {
        model: ollama(modelId),
        providerId: 'ollama',
        modelId,
        supportsTools: false,
      };
    }
    log('router', 'Ollama available but no models loaded');
  } else {
    log('router', 'Ollama not available as fallback');
  }

  log('router', 'All providers exhausted — throwing "No providers available"');
  throw new Error('No providers available');
}

export async function testProvider(providerId: string): Promise<{ ok: boolean; error?: string }> {
  const config = loadConfig();
  const provider = getProvider(providerId);
  
  if (!provider) {
    return { ok: false, error: 'Provider not found' };
  }
  
  const apiKey = process.env[provider.apiKeyEnvVar] || config.providers[providerId]?.apiKey;
  if (!apiKey) {
    return { ok: false, error: 'No API key' };
  }

  try {
    if (provider.type === 'anthropic') {
      createAnthropicProvider(provider);
    } else {
      createOpenAICompatProvider(provider);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function testAllProviders(): Promise<Array<{ providerId: string; providerName: string; ok: boolean; error?: string }>> {
  const providers = getAllProviders();
  const results = [];
  
  for (const provider of providers) {
    const result = await testProvider(provider.id);
    results.push({
      providerId: provider.id,
      providerName: provider.name,
      ...result,
    });
  }
  
  const config = loadConfig();
  if (config.useOllama) {
    const ollamaModels = await getOllamaModels();
    if (ollamaModels.length > 0) {
      results.push({
        providerId: 'ollama',
        providerName: 'Ollama (local)',
        ok: true,
      });
    }
  }

  return results;
}
