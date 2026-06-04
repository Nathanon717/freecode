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
  modelIdExactBlocklist?: string[];
  modelTierBlocklist?: string[];
}

export interface OverridableSettings {
  toolRationale?: boolean;
  showProviderUsage?: boolean;
  parallelTools?: boolean;
}

export interface Config {
  providers: Partial<Record<string, { apiKey?: string }>>;
  defaultModel?: string;
  toolRationale: boolean;
  showProviderUsage: boolean;
  toolConfirmation: 'ask' | 'auto';
  parallelTools: boolean;
  providerOverrides?: Record<string, OverridableSettings>;
  modelOverrides?: Record<string, OverridableSettings>;
  retryMaxWaitSeconds: number;
  showEvalDots: boolean;
}
