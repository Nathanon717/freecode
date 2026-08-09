/**
 * @role Shared interfaces for provider metadata, model metadata, static limits, and loaded config.
 */

// check-tests: no-test — pure type declarations; erased at compile time, no runtime behavior to test
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
  baseUrl?: string;
  apiKeyEnvVar: string;
  defaultApiKey?: string;
  models: ModelConfig[];
  supportsTools?: boolean;
  paid?: boolean;
  /**
   * Set on providers that serve free AND paid models behind one key, to say which
   * model ids are the free ones. It is the single definition of that: model
   * discovery filters the picker with it, and `resolveModel` gates on it under
   * `FREECODE_FREE_ONLY=1` (see providers/paid-guard.ts). A provider with no
   * predicate is treated as free throughout — that is the free-tier default.
   */
  isFreeModelId?: (modelId: string) => boolean;
  modelsSource?: 'static' | 'live';
  modelIdBlocklist?: string[];
  modelIdExactBlocklist?: string[];
  modelTierBlocklist?: string[];
}

export interface OverridableSettings {
  toolRationale?: boolean;
  showProviderUsage?: boolean;
  parallelTools?: boolean;
  loadAgentsMd?: boolean;
  parsedTools?: boolean;
  autoApproveTokenBudget?: number;
}

export interface Config {
  providers: Partial<Record<string, { apiKey?: string }>>;
  defaultModel?: string;
  toolRationale: boolean;
  showProviderUsage: boolean;
  toolConfirmation: 'ask' | 'auto';
  parallelTools: boolean;
  providerOverrides?: Record<string, OverridableSettings>;
  retryMaxWaitSeconds: number;
  showEvalDots: boolean;
  diffContextLines: number;
  loadAgentsMd: boolean;
  /** Auto-approve read-only tool calls costing fewer than this many tokens. 0 = off. */
  autoApproveTokenBudget: number;
}
