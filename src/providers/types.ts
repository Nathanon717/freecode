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
  isNew?: boolean;
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
  modelsSource?: 'static' | 'live';
  modelIdBlocklist?: string[];
}

export interface Config {
  providers: Partial<Record<string, { apiKey?: string }>>;
  preferredModel?: string;
  useOllama: boolean;
  toolRationale: boolean;
}
