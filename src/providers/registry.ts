import type { LanguageModel } from "ai";
import type { ModelConfig, ProviderConfig } from "./types.js";
import { PROVIDER_REGISTRY } from "./registry-data.js";
import { getProviderCache, updateProviderCache } from "./model-cache.js";
import { createOpenAICompatProvider } from "./adapters/openai-compat.js";
import { createAnthropicProvider } from "./adapters/anthropic.js";
import { resolveApiKey } from "../config/index.js";
import { logError } from "../logger.js";
import {
  FAKE_MODEL_PREFIX,
  FAKE_NATIVE_MODEL_PREFIX,
  FAKE_PROVIDER_ID,
  FAKE_NATIVE_PROVIDER_ID,
  createPlaceholderFakeLanguageModel,
  fakeModelSupportsTools,
  isFakeLlmMode,
  isFakeNativeModelPreference,
} from "./fake.js";

export { PROVIDER_REGISTRY };

const initializedProviders = new Set<string>();

function applyBlocklist(
  models: ModelConfig[],
  blocklist: string[],
  exactBlocklist: string[] = [],
): ModelConfig[] {
  if (blocklist.length === 0 && exactBlocklist.length === 0) return models;
  const exactIds = new Set(exactBlocklist);
  return models.filter(
    (m) => !exactIds.has(m.id) && !blocklist.some((b) => m.id.includes(b)),
  );
}

// Score an id for "versioned-ness": higher = more preferable as canonical.
// Versioned IDs (date stamp, semver) beat aliases (latest, fast, turbo, etc.).
function versionScore(id: string): number {
  if (/\d{4}/.test(id)) return 2; // date stamp like -2603 or -2025
  if (/[-_]v?\d+\.\d/.test(id)) return 1; // semver-like
  return 0;
}

function preferAliasOverDated(models: ModelConfig[]): ModelConfig[] {
  const ids = new Set(models.map((m) => m.id));
  return models.filter((m) => {
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
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    return group.reduce((best, m) =>
      versionScore(m.id) >= versionScore(best.id) ? m : best,
    );
  });
}

const ZEN_FREE_IDS = new Set(["big-pickle"]);
const ZEN_RETIRED_FREE_IDS = new Set(["qwen3.6-plus-free"]);

function isCurrentZenFreeModel(model: ModelConfig): boolean {
  return (
    (model.id.endsWith("-free") || ZEN_FREE_IDS.has(model.id)) &&
    !ZEN_RETIRED_FREE_IDS.has(model.id)
  );
}

interface LiveInitSpec {
  fetchModels: () => Promise<ModelConfig[]>;
  selectModels: (models: ModelConfig[]) => ModelConfig[];
}

async function runLiveProviderInit(
  providerId: string,
  spec: LiveInitSpec,
): Promise<void> {
  if (initializedProviders.has(providerId)) return;
  initializedProviders.add(providerId);

  const entry = PROVIDER_REGISTRY.find((p) => p.id === providerId);
  if (!entry) return;

  const finish = (models: ModelConfig[], newIdSet: Set<string>): void => {
    entry.models = spec
      .selectModels(models)
      .map((m) => ({ ...m, ...(newIdSet.has(m.id) ? { isNew: true } : {}) }));
  };

  try {
    const all = await spec.fetchModels();
    const { newIds } = updateProviderCache(providerId, all);
    finish(all, new Set(newIds));
  } catch (err) {
    logError(
      "registry",
      `Failed to fetch ${providerId} models, using cache`,
      err,
    );
    const cached = getProviderCache(providerId);
    if (cached) finish(cached.models, new Set(cached.newIds));
  }
}

async function initOpenRouterModels(): Promise<void> {
  const entry = PROVIDER_REGISTRY.find((p) => p.id === "openrouter");
  if (!entry || !resolveApiKey(entry)) return;
  await runLiveProviderInit("openrouter", {
    fetchModels: async () => {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: Record<string, unknown>[] };
      return json.data
        .filter((m) => typeof m.id === "string")
        .map((m) => ({
          id: m.id as string,
          displayName: typeof m.name === "string" ? m.name : (m.id as string),
          ...(typeof m.context_length === "number"
            ? { contextWindow: m.context_length }
            : {}),
        }));
    },
    selectModels: (models) => models.filter((m) => m.id.endsWith(":free")),
  });
}

async function initZenModels(): Promise<void> {
  const entry = PROVIDER_REGISTRY.find((p) => p.id === "zen");
  const apiKey = entry ? resolveApiKey(entry) : undefined;
  if (!entry?.baseUrl || !apiKey) return;
  await runLiveProviderInit("zen", {
    fetchModels: async () => {
      const res = await fetch(`${entry.baseUrl!}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as
        | { data?: Record<string, unknown>[] }
        | Record<string, unknown>[];
      const data = Array.isArray(json)
        ? json
        : ((json as { data?: Record<string, unknown>[] }).data ?? []);
      return data
        .filter((m) => typeof m.id === "string")
        .map((m) => ({
          id: m.id as string,
          displayName: typeof m.name === "string" ? m.name : (m.id as string),
          ...(typeof m.context_length === "number"
            ? { contextWindow: m.context_length }
            : {}),
        }));
    },
    selectModels: (models) => {
      const blocklist = entry.modelIdBlocklist ?? [];
      const exactBlocklist = entry.modelIdExactBlocklist ?? [];
      return applyBlocklist(models, blocklist, exactBlocklist).filter(
        isCurrentZenFreeModel,
      );
    },
  });
}

async function initAnthropicModels(): Promise<void> {
  const entry = PROVIDER_REGISTRY.find((p) => p.id === "anthropic");
  const apiKey = entry ? resolveApiKey(entry) : undefined;
  if (!entry || !apiKey) return;
  await runLiveProviderInit("anthropic", {
    fetchModels: async () => {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: Record<string, unknown>[] };
      return json.data
        .filter((m) => typeof m.id === "string")
        .map((m) => ({
          id: m.id as string,
          displayName:
            typeof m.display_name === "string"
              ? m.display_name
              : (m.id as string),
        }));
    },
    selectModels: (models) => models,
  });
}

async function initProviderModels(
  providerId: string,
  apiKey: string | undefined,
): Promise<void> {
  const entry = PROVIDER_REGISTRY.find((p) => p.id === providerId);
  if (!entry?.baseUrl || !apiKey) return;
  const blocklist = entry.modelIdBlocklist ?? [];
  const exactBlocklist = entry.modelIdExactBlocklist ?? [];
  const tierBlocklist = entry.modelTierBlocklist ?? [];
  await runLiveProviderInit(providerId, {
    fetchModels: async () => {
      const res = await fetch(`${entry.baseUrl!}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as
        | { data?: Record<string, unknown>[] }
        | Record<string, unknown>[];
      const data = Array.isArray(json)
        ? json
        : ((json as { data?: Record<string, unknown>[] }).data ?? []);
      return data
        .filter((m) => typeof m.id === "string")
        .filter(
          (m) =>
            tierBlocklist.length === 0 ||
            !tierBlocklist.includes(m.tier as string),
        )
        .map((m) => {
          const cw = m.context_window;
          const contextWindow =
            typeof cw === "number"
              ? cw
              : cw !== null && typeof cw === "object"
                ? (((cw as Record<string, unknown>).tokens ??
                    (cw as Record<string, unknown>).chars) as
                    | number
                    | undefined)
                : undefined;
          return {
            id: m.id as string,
            displayName: typeof m.name === "string" ? m.name : (m.id as string),
            ...(contextWindow != null ? { contextWindow } : {}),
          };
        });
    },
    selectModels: (models) =>
      preferAliasOverDated(
        deduplicateByDisplayName(
          applyBlocklist(models, blocklist, exactBlocklist),
        ),
      ),
  });
}

const LIVE_PROVIDER_IDS = [
  "groq",
  "siliconflow",
  "cerebras",
  "mistral",
  "llm7",
  "cohere",
  "openai",
  "nvidia",
] as const;

export async function initDynamicProviders(): Promise<void> {
  if (isFakeLlmMode()) {
    throw new Error(
      "Live model discovery is blocked while FREECODE_FAKE_LLM=1",
    );
  }

  await Promise.all([
    initOpenRouterModels(),
    initZenModels(),
    initAnthropicModels(),
    ...LIVE_PROVIDER_IDS.map((id) => {
      const entry = PROVIDER_REGISTRY.find((p) => p.id === id);
      return initProviderModels(id, entry ? resolveApiKey(entry) : undefined);
    }),
  ]);
}


export function getProvider(id: string): ProviderConfig | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function clearModelNewFlag(providerId: string, modelId: string): void {
  const provider = PROVIDER_REGISTRY.find((p) => p.id === providerId);
  if (!provider) return;
  const model = provider.models.find((m) => m.id === modelId);
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
    throw new Error("No model selected. Use /model to choose one.");
  }

  const colonIdx = modelPreference.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(
      `Invalid model format: "${modelPreference}". Expected "provider:model".`,
    );
  }

  const providerId = modelPreference.slice(0, colonIdx);
  const modelId = modelPreference.slice(colonIdx + 1);

  if (
    isFakeLlmMode() &&
    providerId !== FAKE_PROVIDER_ID &&
    providerId !== FAKE_NATIVE_PROVIDER_ID
  ) {
    throw new Error(
      `Real provider access is blocked while FREECODE_FAKE_LLM=1: "${providerId}"`,
    );
  }

  if (modelPreference.startsWith(FAKE_MODEL_PREFIX)) {
    if (!isFakeLlmMode()) {
      throw new Error(
        `Mock model "${modelPreference}" is only available when FREECODE_FAKE_LLM=1`,
      );
    }
    return {
      model: createPlaceholderFakeLanguageModel(),
      providerId: FAKE_PROVIDER_ID,
      modelId,
      supportsTools: fakeModelSupportsTools(modelId),
    };
  }

  if (isFakeNativeModelPreference(modelPreference)) {
    if (!isFakeLlmMode()) {
      throw new Error(
        `Mock-native model "${modelPreference}" is only available when FREECODE_FAKE_LLM=1`,
      );
    }
    return {
      model: createPlaceholderFakeLanguageModel(),
      providerId: FAKE_NATIVE_PROVIDER_ID,
      modelId: modelPreference.slice(FAKE_NATIVE_MODEL_PREFIX.length),
      supportsTools: fakeModelSupportsTools(modelId),
    };
  }

  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown provider: "${providerId}"`);
  }

  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    throw new Error(
      `No API key configured for ${provider.name}. Use /keys to check.`,
    );
  }

  const model =
    provider.type === "anthropic"
      ? createAnthropicProvider(provider)(modelId)
      : (createOpenAICompatProvider(provider)(modelId) as LanguageModel);

  return {
    model,
    providerId: provider.id,
    modelId,
    supportsTools: provider.supportsTools !== false,
  };
}
