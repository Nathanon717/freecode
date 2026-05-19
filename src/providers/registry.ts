import type { ProviderConfig } from './types.js';

export const PROVIDER_REGISTRY: ProviderConfig[] = [
  {
    id: 'groq',
    name: 'Groq',
    type: 'openai-compat',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnvVar: 'GROQ_API_KEY',
    models: [
      { id: 'allam-2-7b', displayName: 'Allam 2 7B', limits: { rpm: 30, rpd: 7000, tpm: 6000, tpd: 500000 } },
      { id: 'groq/compound', displayName: 'Groq Compound', limits: { rpm: 30, rpd: 250, tpm: 70000, tpd: null } },
      { id: 'groq/compound-mini', displayName: 'Groq Compound Mini', limits: { rpm: 30, rpd: 250, tpm: 70000, tpd: null } },
      { id: 'llama-3.1-8b-instant', displayName: 'Llama 3.1 8B Instant', limits: { rpm: 30, rpd: 14400, tpm: 6000, tpd: 500000 } },
      { id: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B', limits: { rpm: 30, rpd: 1000, tpm: 12000, tpd: 100000 } },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', displayName: 'Llama 4 Scout', limits: { rpm: 30, rpd: 1000, tpm: 30000, tpd: 500000 } },
      { id: 'openai/gpt-oss-120b', displayName: 'GPT-OSS 120B', limits: { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 } },
      { id: 'openai/gpt-oss-20b', displayName: 'GPT-OSS 20B', limits: { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 } },
      { id: 'qwen/qwen3-32b', displayName: 'Qwen3 32B', limits: { rpm: 60, rpd: 1000, tpm: 6000, tpd: 500000 } },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'openai-compat',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', displayName: 'Llama 3.3 70B', contextWindow: 128000 },
      { id: 'deepseek/deepseek-v4-flash:free', displayName: 'DeepSeek V4 Flash' },
      { id: 'openai/gpt-oss-120b:free', displayName: 'GPT-OSS 120B' },
      { id: 'nousresearch/hermes-3-llama-3.1-405b:free', displayName: 'Hermes 3 405B' },
      { id: 'google/gemma-4-31b-it:free', displayName: 'Gemma 4 31B' },
      { id: 'qwen/qwen3-coder:free', displayName: 'Qwen3 Coder' },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', displayName: 'Nemotron Super 120B' },
    ],
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    type: 'openai-compat',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeyEnvVar: 'SILICONFLOW_API_KEY',
    models: [
      { id: 'Qwen/Qwen3-8B', displayName: 'Qwen3 8B' },
      { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', displayName: 'DeepSeek R1 Distill 7B' },
    ],
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
    models: [
      { id: 'llama3.1-8b', displayName: 'Llama 3.1 8B', contextWindow: 128000 },
      { id: 'qwen-3-235b-a22b-instruct-2507', displayName: 'Qwen3 235B', contextWindow: 32000 },
      { id: 'zai-glm-4.7', displayName: 'Z.ai GLM 4.7', contextWindow: 128000 },
      { id: 'gpt-oss-120b', displayName: 'GPT OSS 120B', contextWindow: 128000 },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    type: 'openai-compat',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyEnvVar: 'MISTRAL_API_KEY',
    models: [
      { id: 'mistral-large-latest', displayName: 'Mistral Large', contextWindow: 128000 },
      { id: 'mistral-small-latest', displayName: 'Mistral Small', contextWindow: 128000 },
      { id: 'open-mistral-nemo', displayName: 'Mistral Nemo', contextWindow: 128000 },
      { id: 'ministral-3b-latest', displayName: 'Ministral 3B', contextWindow: 128000 },
      { id: 'ministral-8b-latest', displayName: 'Ministral 8B', contextWindow: 128000 },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai-compat',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    paid: true,
    models: [
      { id: 'gpt-4.1', displayName: 'GPT-4.1', contextWindow: 1047576 },
      { id: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', contextWindow: 1047576 },
      { id: 'gpt-4.1-nano', displayName: 'GPT-4.1 Nano', contextWindow: 1047576 },
      { id: 'gpt-4o', displayName: 'GPT-4o', contextWindow: 128000 },
      { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', contextWindow: 128000 },
      { id: 'o3', displayName: 'o3', contextWindow: 200000 },
      { id: 'o4-mini', displayName: 'o4-mini', contextWindow: 200000 },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    paid: true,
    models: [
      { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5', contextWindow: 200000 },
      { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', contextWindow: 200000 },
      { id: 'claude-opus-4-7', displayName: 'Claude Opus 4.7', contextWindow: 200000 },
    ],
  },
];

export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDER_REGISTRY.find(p => p.id === id);
}

export function getAllProviders(): ProviderConfig[] {
  return [...PROVIDER_REGISTRY];
}
