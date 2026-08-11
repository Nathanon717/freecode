/**
 * @role Runtime layer over the static provider catalog in [provider-catalog.md](./provider-catalog.md), which it re-exports as `PROVIDER_REGISTRY`. Owns live model-list fetching and init, model filtering, dead-model retirement and blocklisting, and `resolveModel`, which turns a model preference into a provider plus a ready model instance.
 *
 * @readwhen
 * - Debugging live model-list init, filtering, retirement, or blocklisting.
 * - Changing which providers fetch models live via `LIVE_PROVIDER_IDS`, or how live display names and context windows land on registry entries. Provider definitions and their order live in [provider-catalog.md](./provider-catalog.md).
 * - Debugging router selection where registry order or provider metadata matters.
 *
 * For the generated provider table, see [providers.md](../../providers.md).
 */

import type { LanguageModel } from "ai";
import type { ModelConfig, ProviderConfig } from "./types.js";
import { PROVIDER_REGISTRY, isFreeModel, selectFreeModels } from "./provider-catalog.js";
import { freeOnlyRefusal, isFreeOnlyMode } from "./paid-guard.js";
import { getDeadIds, getProviderCache, recordDeadModel, updateProviderCache } from "../store/model-list-cache.js";
import { getProviderCatalog, saveProviderCatalog } from "./model-data.js";
import { createOpenAICompatProvider } from "./adapters/openai-compat.js";
import { resolveApiKey } from "../config/index.js";
import { addToUserBlocklist, getUserBlocklist } from "./user-blocklist.js";
import { logError, logWarn } from "../logger.js";
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

// Shared promise across all callers so a prefetch fired at startup and a later
// /model open await the same in-flight fetch rather than duplicating it.
let initPromise: Promise<void> | null = null;

async function _doInit(): Promise<void> {
  try {
    await Promise.all([
      initOpenRouterModels(),
      initZenModels(),
      ...LIVE_PROVIDER_IDS.map((id) => {
        const entry = PROVIDER_REGISTRY.find((p) => p.id === id);
        return initProviderModels(id, entry ? resolveApiKey(entry) : undefined);
      }),
    ]);
  } catch (err) {
    logError("registry", "Unexpected error during model init", err);
  }
  // Strip the user's own blocklist from static providers' models before their catalog
  // is written below, so a permanently removed model never earns a `models` row again.
  // Live providers already applied both blocklists in runLiveProviderInit's finish()
  // before writing their catalog; this strip only matters for static providers, whose
  // catalog is written at the loop below (after this) rather than during init.
  const userBlocklist = getUserBlocklist();
  if (userBlocklist.size > 0) {
    for (const provider of PROVIDER_REGISTRY) {
      provider.models = provider.models.filter(
        (m) => !userBlocklist.has(`${provider.id}:${m.id}`),
      );
    }
  }

  // Static providers never run a live init, so their catalog is written here.
  // Live ones already wrote theirs; the change check makes the repeat a no-op.
  for (const provider of PROVIDER_REGISTRY) {
    if (!resolveApiKey(provider)) continue;
    saveProviderCatalog(
      provider.id,
      provider.models.map((m) => ({
        modelId: m.id,
        displayName: m.displayName,
        ...(m.contextWindow != null ? { contextWindow: m.contextWindow } : {}),
      })),
    );
  }
}

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

  const deadIdSet = new Set(getDeadIds(providerId));
  // Blocklists are applied here, centrally, rather than relying on each provider's
  // selectModels: some (openrouter) don't filter at all, so without this
  // a blocklisted id fetched live would earn a catalog row on every launch, and a
  // model the user removed fully would come straight back. Covers both the registry
  // blocklist and the user's own, so entry.models (picker) and the catalog agree.
  const blocklist = entry.modelIdBlocklist ?? [];
  const exactBlocklist = new Set(entry.modelIdExactBlocklist ?? []);
  const userBlocklist = getUserBlocklist();
  const finish = (models: ModelConfig[], newIdSet: Set<string>): void => {
    entry.models = spec
      .selectModels(models)
      .filter((m) => !deadIdSet.has(m.id))
      .filter(
        (m) =>
          !exactBlocklist.has(m.id) &&
          !blocklist.some((b) => m.id.includes(b)) &&
          !userBlocklist.has(`${providerId}:${m.id}`),
      )
      .map((m) => ({ ...m, ...(newIdSet.has(m.id) ? { isNew: true } : {}) }));
  };

  try {
    const all = await spec.fetchModels();
    const { newIds } = updateProviderCache(providerId, all);
    finish(all, new Set(newIds));
    // The DB owns the catalog, so it's written from the *selected* list — blocklisted
    // and dead models never get a row. model-cache.json keeps only the id bookkeeping.
    saveProviderCatalog(
      providerId,
      entry.models.map((m) => ({
        modelId: m.id,
        displayName: m.displayName,
        ...(m.contextWindow != null ? { contextWindow: m.contextWindow } : {}),
      })),
    );
  } catch (err) {
    // logWarn, not logError: the catch below has a full answer (the cached catalog), and
    // every throw on this path is our own `new Error("HTTP <status>")` a few lines up, so
    // the stack names freecode's fetch wrapper and nothing the message doesn't already say.
    logWarn(
      "registry",
      `Failed to fetch ${providerId} models, using cache`,
      err,
    );
    // Offline: names and context windows live in the DB now. selectModels has already
    // been applied to what's stored, so the catalog goes straight onto the entry;
    // only the dead-id filter and the cached new-id flags still need applying.
    const cached = getProviderCache(providerId);
    const newIdSet = new Set(cached?.newIds ?? []);
    entry.models = getProviderCatalog(providerId)
      .filter((m) => !deadIdSet.has(m.modelId))
      .map((m) => ({
        id: m.modelId,
        displayName: m.displayName,
        ...(m.contextWindow != null ? { contextWindow: m.contextWindow } : {}),
        ...(newIdSet.has(m.modelId) ? { isNew: true } : {}),
      }));
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
    selectModels: (models) => selectFreeModels(entry, models),
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
        : ((json).data ?? []);
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
      return selectFreeModels(
        entry,
        applyBlocklist(models, blocklist, exactBlocklist),
      );
    },
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
        : ((json).data ?? []);
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
            // Anthropic labels its models `display_name`; everyone else uses `name`.
            displayName:
              typeof m.name === "string"
                ? m.name
                : typeof m.display_name === "string"
                  ? m.display_name
                  : (m.id as string),
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
  "anthropic",
] as const;

export async function initDynamicProviders(): Promise<void> {
  if (isFakeLlmMode()) {
    throw new Error(
      "Live model discovery is blocked while FREECODE_FAKE_LLM=1",
    );
  }
  if (!initPromise) initPromise = _doInit();
  await initPromise;
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

/**
 * Permanently blocklist a model for this user: persist the key and drop it from the
 * live registry so the running session stops offering it immediately. `_doInit` applies
 * the same filter on every later launch. The caller owns deleting the DB rows.
 */
export function blocklistModelPermanently(providerId: string, modelId: string): void {
  addToUserBlocklist(`${providerId}:${modelId}`);
  const entry = PROVIDER_REGISTRY.find((p) => p.id === providerId);
  if (entry) entry.models = entry.models.filter((m) => m.id !== modelId);
}

export function retireDeadModel(providerId: string, modelId: string): void {
  recordDeadModel(providerId, modelId);
  const entry = PROVIDER_REGISTRY.find((p) => p.id === providerId);
  if (entry) entry.models = entry.models.filter((m) => m.id !== modelId);
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

  // The hard block on spend. Checked here because every path that reaches a live
  // provider funnels through this function — including the three that never
  // consult the picker's filtered list: `--model`, `FREECODE_MODEL`, and a
  // persisted `defaultModel`. Filtering model *discovery* never covered those.
  if (isFreeOnlyMode()) {
    if (provider.paid) {
      throw new Error(
        freeOnlyRefusal(modelPreference, `is served by ${provider.name}, a paid provider,`),
      );
    }
    if (!isFreeModel(provider, modelId)) {
      throw new Error(
        freeOnlyRefusal(modelPreference, `is not a free ${provider.name} model`),
      );
    }
  }

  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    throw new Error(
      `No API key configured for ${provider.name}. Use /keys to check.`,
    );
  }

  return {
    model: createOpenAICompatProvider(provider)(modelId),
    providerId: provider.id,
    modelId,
    supportsTools: provider.supportsTools !== false,
  };
}
