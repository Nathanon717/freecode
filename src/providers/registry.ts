import type { LanguageModel } from 'ai';
import type { ModelConfig, ProviderConfig } from './types.js';
import { getProviderCache, updateProviderCache } from './model-cache.js';
import { createOpenAICompatProvider } from './adapters/openai-compat.js';
import { createAnthropicProvider } from './adapters/anthropic.js';
import { resolveApiKey } from '../config/index.js';
import { syncLiveModels } from './canonical-models.js';
import { logError } from '../logger.js';

const initializedProviders = new Set<string>();

function applyBlocklist(models: ModelConfig[], blocklist: string[], exactBlocklist: string[] = []): ModelConfig[] {
  if (blocklist.length === 0 && exactBlocklist.length === 0) return models;
  const exactIds = new Set(exactBlocklist);
  return models.filter(m => !exactIds.has(m.id) && !blocklist.some(b => m.id.includes(b)));
}

async function initOpenRouterModels(): Promise<void> {
  if (initializedProviders.has('openrouter')) return;
  initializedProviders.add('openrouter');

  const entry = PROVIDER_REGISTRY.find(p => p.id === 'openrouter');
  if (!entry) return;

  if (!resolveApiKey(entry)) return;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data: Record<string, unknown>[] };
    const normalized = json.data
      .filter(m => typeof m.id === 'string')
      .map(m => ({
        id: m.id as string,
        displayName: typeof m.name === 'string' ? m.name : m.id as string,
        ...(typeof m.context_length === 'number' ? { contextWindow: m.context_length } : {}),
      }));
    const { newIds } = updateProviderCache('openrouter', normalized);
    const newIdSet = new Set(newIds);
    const free = normalized
      .filter(m => m.id.endsWith(':free'))
      .map(m => ({ ...m, ...(newIdSet.has(m.id) ? { isNew: true } : {}) }));
    entry.models = free;
    syncLiveModels('openrouter', entry.models.map(m => m.id));
  } catch (err) {
    logError('registry', 'Failed to fetch OpenRouter models, using cache', err);
    const cached = getProviderCache('openrouter');
    if (cached) {
      entry.models = cached.models.filter(m => m.id.endsWith(':free'));
      syncLiveModels('openrouter', entry.models.map(m => m.id));
    }
  }
}

// Score an id for "versioned-ness": higher = more preferable as canonical.
// Versioned IDs (date stamp, semver) beat aliases (latest, fast, turbo, etc.).
function versionScore(id: string): number {
  if (/\d{4}/.test(id)) return 2;   // date stamp like -2603 or -2025
  if (/[-_]v?\d+\.\d/.test(id)) return 1; // semver-like
  return 0;
}

function preferAliasOverDated(models: ModelConfig[]): ModelConfig[] {
  const ids = new Set(models.map(m => m.id));
  return models.filter(m => {
    // Matches YYYY-MM-DD (e.g. gpt-5.4-nano-2026-03-17) and legacy MMDD (e.g. gpt-4-0613)
    const match = m.id.match(/^(.+)-\d{4}(-\d{2}-\d{2})?$/);
    if (!match) return true;
    return !ids.has(match[1]);
  });
}

function deduplicateByDisplayName(models: ModelConfig[]): ModelConfig[] {
  const groups = new Map<string, ModelConfig[]>();
  for (const m of models) {
    const key = m.displayName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  return [...groups.values()].map(group => {
    if (group.length === 1) return group[0];
    return group.reduce((best, m) => versionScore(m.id) >= versionScore(best.id) ? m : best);
  });
}

async function initProviderModels(providerId: string, apiKey: string | undefined): Promise<void> {
  if (initializedProviders.has(providerId)) return;
  initializedProviders.add(providerId);

  const entry = PROVIDER_REGISTRY.find(p => p.id === providerId);
  if (!entry?.baseUrl || !apiKey) return;

  const blocklist = entry.modelIdBlocklist ?? [];
  const exactBlocklist = entry.modelIdExactBlocklist ?? [];

  try {
    const res = await fetch(`${entry.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data?: Record<string, unknown>[] };
    const normalized = (json.data ?? [])
      .filter(m => typeof m.id === 'string')
      .map(m => ({
        id: m.id as string,
        displayName: typeof m.name === 'string' ? m.name : m.id as string,
        ...(typeof m.context_window === 'number' ? { contextWindow: m.context_window } : {}),
      }));
    const { newIds } = updateProviderCache(providerId, normalized);
    const newIdSet = new Set(newIds);
    const filtered = preferAliasOverDated(deduplicateByDisplayName(applyBlocklist(normalized, blocklist, exactBlocklist)));
    entry.models = filtered.map(m => ({ ...m, ...(newIdSet.has(m.id) ? { isNew: true } : {}) }));
    syncLiveModels(providerId, entry.models.map(m => m.id));
  } catch (err) {
    logError('registry', `Failed to fetch ${providerId} models, using cache`, err);
    const cached = getProviderCache(providerId);
    if (cached) {
      entry.models = preferAliasOverDated(deduplicateByDisplayName(applyBlocklist(cached.models, blocklist, exactBlocklist)));
      const newIdSet = new Set(cached.newIds);
      entry.models = entry.models.map(m => ({ ...m, ...(newIdSet.has(m.id) ? { isNew: true } : {}) }));
      syncLiveModels(providerId, entry.models.map(m => m.id));
    }
  }
}

const LIVE_PROVIDER_IDS = ['groq', 'siliconflow', 'cerebras', 'mistral', 'openai'] as const;

async function initAnthropicModels(): Promise<void> {
  if (initializedProviders.has('anthropic')) return;
  initializedProviders.add('anthropic');

  const entry = PROVIDER_REGISTRY.find(p => p.id === 'anthropic');
  if (!entry) return;

  const apiKey = process.env[entry.apiKeyEnvVar];
  if (!apiKey) return;

  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data: Record<string, unknown>[] };
    const normalized = json.data
      .filter(m => typeof m.id === 'string')
      .map(m => ({
        id: m.id as string,
        displayName: typeof m.display_name === 'string' ? m.display_name : m.id as string,
      }));
    const { newIds } = updateProviderCache('anthropic', normalized);
    const newIdSet = new Set(newIds);
    entry.models = normalized.map(m => ({ ...m, ...(newIdSet.has(m.id) ? { isNew: true } : {}) }));
    syncLiveModels('anthropic', entry.models.map(m => m.id));
  } catch (err) {
    logError('registry', 'Failed to fetch Anthropic models, using cache', err);
    const cached = getProviderCache('anthropic');
    if (cached) {
      const newIdSet = new Set(cached.newIds);
      entry.models = cached.models.map(m => ({ ...m, ...(newIdSet.has(m.id) ? { isNew: true } : {}) }));
      syncLiveModels('anthropic', entry.models.map(m => m.id));
    }
  }
}

export async function initDynamicProviders(): Promise<void> {
  await Promise.all([
    initOpenRouterModels(),
    initAnthropicModels(),
    ...LIVE_PROVIDER_IDS.map(id => {
      const entry = PROVIDER_REGISTRY.find(p => p.id === id);
      return initProviderModels(id, entry ? process.env[entry.apiKeyEnvVar] : undefined);
    }),
  ]);
}

export const PROVIDER_REGISTRY: ProviderConfig[] = [
  {
    id: 'groq',
    name: 'Groq',
    type: 'openai-compat',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnvVar: 'GROQ_API_KEY',
    modelsSource: 'live',
    modelIdBlocklist: ['llama-prompt-guard', 'canopylabs', 'whisper'],
    models: [],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openai-compat',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    modelsSource: 'live',
    modelIdBlocklist: [],
    models: [],
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    type: 'openai-compat',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeyEnvVar: 'SILICONFLOW_API_KEY',
    modelsSource: 'live',
    modelIdBlocklist: [],
    models: [],
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    type: 'openai-compat',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnvVar: 'NVIDIA_API_KEY',
    models: [
      { id: 'meta/llama-3.3-70b-instruct', displayName: 'Llama 3.3 70B', contextWindow: 128000 },
      { id: 'meta/llama-4-maverick-17b-128e-instruct', displayName: 'Llama 4 Maverick' },
      { id: 'mistralai/mistral-large', displayName: 'Mistral Large', contextWindow: 128000 },
      { id: 'deepseek-ai/deepseek-v4-flash', displayName: 'DeepSeek V4 Flash' },
      { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', displayName: 'Nemotron Ultra 253B' },
      { id: 'qwen/qwen3-next-80b-a3b-instruct', displayName: 'Qwen3 Next 80B' },
    ],
  },
  {
    id: 'llm7',
    name: 'LLM7',
    type: 'openai-compat',
    baseUrl: 'https://api.llm7.io/v1',
    apiKeyEnvVar: 'LLM7_API_KEY',
    models: [
      { id: 'gpt-oss-20b', displayName: 'GPT-OSS 20B' },
      { id: 'codestral-latest', displayName: 'Codestral' },
      { id: 'GLM-4.6V-Flash', displayName: 'GLM 4.6V Flash' },
    ],
  },
  {
    id: 'github',
    name: 'GitHub Models',
    type: 'openai-compat',
    baseUrl: 'https://models.inference.githubusercontent.com/v1',
    apiKeyEnvVar: 'GITHUB_TOKEN',
    models: [
      { id: 'gpt-4o', displayName: 'GPT-4o', contextWindow: 128000 },
      { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', contextWindow: 128000 },
      { id: 'Meta-Llama-3.1-405B-Instruct', displayName: 'Llama 3.1 405B', contextWindow: 128000 },
      { id: 'Meta-Llama-3.1-8B-Instruct', displayName: 'Llama 3.1 8B', contextWindow: 128000 },
    ],
  },
  {
    id: 'cohere',
    name: 'Cohere',
    type: 'openai-compat',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    apiKeyEnvVar: 'COHERE_API_KEY',
    models: [
      { id: 'command-a-03-2025', displayName: 'Command A', contextWindow: 256000 },
      { id: 'command-r-plus-08-2024', displayName: 'Command R+', contextWindow: 128000 },
      { id: 'command-r-08-2024', displayName: 'Command R', contextWindow: 128000 },
      { id: 'command-r7b-12-2024', displayName: 'Command R7B', contextWindow: 128000 },
    ],
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    type: 'openai-compat',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyEnvVar: 'CEREBRAS_API_KEY',
    modelsSource: 'live',
    modelIdBlocklist: [],
    models: [],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    type: 'openai-compat',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyEnvVar: 'MISTRAL_API_KEY',
    modelsSource: 'live',
    modelIdBlocklist: ['voxtral', 'embed', 'ocr', 'moderation', 'pixtral', 'labs'],
    models: [],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    type: 'openai-compat',
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID ?? ''}/ai/v1`,
    apiKeyEnvVar: 'CLOUDFLARE_API_KEY',
    models: [
      { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', displayName: 'Llama 3.3 70B Fast', contextWindow: 128000 },
      { id: '@cf/meta/llama-3.1-8b-instruct', displayName: 'Llama 3.1 8B', contextWindow: 128000 },
      { id: '@cf/qwen/qwen2.5-coder-32b-instruct', displayName: 'Qwen2.5 Coder 32B', contextWindow: 32768 },
      { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', displayName: 'DeepSeek R1 Distill 32B', contextWindow: 32768 },
    ],
  },
  {
    id: 'zai',
    name: 'Z.ai (ZhipuAI)',
    type: 'openai-compat',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyEnvVar: 'ZAI_API_KEY',
    models: [
      { id: 'glm-4.7-flash', displayName: 'GLM-4.7 Flash (free)', contextWindow: 128000 },
      { id: 'glm-4.5-flash', displayName: 'GLM-4.5 Flash (free)', contextWindow: 128000 },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai-compat',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    paid: true,
    modelsSource: 'live',
    modelIdBlocklist: ['embed', 'tts', 'audio', 'realtime', 'image', 'sora', 'whisper', 'gpt-3', 'moderation', 'transcribe', 'search', 'davinci', 'babbage', 'computer-use'],
    modelIdExactBlocklist: ['chat-latest'],
    models: [],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    paid: true,
    modelsSource: 'live',
    models: [],
  },
];

export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDER_REGISTRY.find(p => p.id === id);
}

export function clearModelNewFlag(providerId: string, modelId: string): void {
  const provider = PROVIDER_REGISTRY.find(p => p.id === providerId);
  if (!provider) return;
  const model = provider.models.find(m => m.id === modelId);
  if (model) delete model.isNew;
}

export interface ResolvedModel {
  model: LanguageModel;
  providerId: string;
  modelId: string;
  supportsTools: boolean;
}

export function resolveModel(modelPreference: string): ResolvedModel {
  if (!modelPreference) {
    throw new Error('No model selected. Use /model to choose one.');
  }

  const colonIdx = modelPreference.indexOf(':');
  if (colonIdx === -1) {
    throw new Error(`Invalid model format: "${modelPreference}". Expected "provider:model".`);
  }

  const providerId = modelPreference.slice(0, colonIdx);
  const modelId = modelPreference.slice(colonIdx + 1);

  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown provider: "${providerId}"`);
  }

  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    throw new Error(`No API key configured for ${provider.name}. Use /keys to check.`);
  }

  const model = provider.type === 'anthropic'
    ? createAnthropicProvider(provider)(modelId) as LanguageModel
    : createOpenAICompatProvider(provider)(modelId) as LanguageModel;

  return {
    model,
    providerId: provider.id,
    modelId,
    supportsTools: provider.supportsTools !== false,
  };
}
