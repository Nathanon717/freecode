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
      { id: 'moonshotai/kimi-k2-instruct', displayName: 'Kimi K2', limits: { rpm: 60, rpd: 1000, tpm: 10000, tpd: 300000 } },
      { id: 'moonshotai/kimi-k2-instruct-0905', displayName: 'Kimi K2 (0905)', limits: { rpm: 60, rpd: 1000, tpm: 10000, tpd: 300000 } },
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
      { id: 'deepseek/deepseek-r1', displayName: 'DeepSeek R1', contextWindow: 163840 },
      { id: 'meta-llama/llama-3.3-70b-instruct', displayName: 'Llama 3.3 70B', contextWindow: 128000 },
      { id: 'qwen/qwen-2.5-72b-instruct', displayName: 'Qwen 2.5 72B', contextWindow: 32000 },
    ],
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    type: 'openai-compat',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeyEnvVar: 'SILICONFLOW_API_KEY',
    models: [
      { id: 'deepseek-ai/DeepSeek-R1', displayName: 'DeepSeek R1', contextWindow: 163840 },
      { id: 'deepseek-ai/DeepSeek-V3', displayName: 'DeepSeek V3', contextWindow: 163840 },
      { id: 'Qwen/Qwen2.5-72B-Instruct-128K', displayName: 'Qwen2.5 72B', contextWindow: 128000 },
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
      { id: 'mistralai/mistral-large-2', displayName: 'Mistral Large', contextWindow: 128000 },
      { id: 'qwen/qwen3-235b-a22m', displayName: 'Qwen3 235B', contextWindow: 32000 },
    ],
  },
  {
    id: 'llm7',
    name: 'LLM7',
    type: 'openai-compat',
    baseUrl: 'https://api.llm7.io/v1',
    apiKeyEnvVar: 'LLM7_API_KEY',
    supportsTools: false,
    models: [
      { id: 'deepseek-ai/DeepSeek-R1', displayName: 'DeepSeek R1', contextWindow: 64000 },
      { id: 'Qwen/Qwen2.5-Coder-14B-Instruct', displayName: 'Qwen2.5 Coder 14B', contextWindow: 32000 },
      { id: 'deepseek-ai/DeepSeek-V3', displayName: 'DeepSeek V3', contextWindow: 64000 },
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
      { id: 'meta-llama/Llama-3.1-70B-Instruct', displayName: 'Llama 3.1 70B', contextWindow: 128000 },
      { id: 'meta-llama/Llama-3.1-8B-Instruct', displayName: 'Llama 3.1 8B', contextWindow: 128000 },
    ],
  },
  {
    id: 'cohere',
    name: 'Cohere',
    type: 'openai-compat',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    apiKeyEnvVar: 'COHERE_API_KEY',
    models: [
      { id: 'command-r-plus-08-2024', displayName: 'Command R+', contextWindow: 128000 },
      { id: 'command-r-08-2024', displayName: 'Command R', contextWindow: 128000 },
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
      { id: 'zai-glm-4-7b', displayName: 'Z.ai GLM 4.7', contextWindow: 128000 },
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
      { id: 'mistral-nemo-latest', displayName: 'Mistral Nemo', contextWindow: 128000 },
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
    ],
  },
];

export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDER_REGISTRY.find(p => p.id === id);
}

export function getAllProviders(): ProviderConfig[] {
  return [...PROVIDER_REGISTRY];
}
