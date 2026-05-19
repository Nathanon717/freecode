export interface RateLimits {
  rpm: number;
  rpd: number;
  tpm: number;
  tpd: number | null;
}

export interface ModelConfig {
  id: string;
  displayName: string;
  contextWindow?: number;
  limits?: RateLimits;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: 'openai-compat' | 'anthropic';
  baseUrl?: string;
  apiKeyEnvVar: string;
  models: ModelConfig[];
  supportsTools?: boolean;
  paid?: boolean;
}

export interface Config {
  providers: Partial<Record<string, { apiKey?: string; preferredModel?: string }>>;
  preferLocal: boolean;
  useOllama: boolean;
  toolRationale: boolean;
}
