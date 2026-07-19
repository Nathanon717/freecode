import { PROVIDER_REGISTRY } from './provider-catalog.js';
import { getUserBlocklist } from './user-blocklist.js';
import { getModelData, deleteModelRows } from '../store/db.js';

/** One stored model that a registry blocklist now excludes. */
export interface BlocklistedStoredModel {
  key: string;
  provider: string;
  modelId: string;
  displayName?: string;
}

/**
 * Stored models that the registry's ID blocklists now exclude.
 *
 * Blocklists live in `provider-catalog.ts` and only ever filter a *live* model list,
 * so a model that already earned a `models` row before its id was blocklisted keeps
 * that row (and its evals, call log, and user state) forever. This finds those rows.
 *
 * The user blocklist (`user-blocklist.ts`) is checked too, so hand-editing that file
 * purges the matching rows on the next launch just like a registry edit does.
 *
 * `modelTierBlocklist` is not considered: it matches on a tier field that is never
 * stored on the row, so it cannot be re-derived from the DB.
 *
 * Reads the in-memory store, so the caller must have awaited `ensureStoreReady()`.
 */
export function findBlocklistedStoredModels(): BlocklistedStoredModel[] {
  const store = getModelData() ?? {};
  const userBlocklist = getUserBlocklist();
  const found: BlocklistedStoredModel[] = [];
  for (const provider of PROVIDER_REGISTRY) {
    const substrings = provider.modelIdBlocklist ?? [];
    const exact = new Set(provider.modelIdExactBlocklist ?? []);
    if (substrings.length === 0 && exact.size === 0 && userBlocklist.size === 0) continue;
    for (const [key, entry] of Object.entries(store)) {
      if (entry.provider !== provider.id) continue;
      if (
        !userBlocklist.has(key) &&
        !exact.has(entry.modelId) &&
        !substrings.some((b) => entry.modelId.includes(b))
      )
        continue;
      found.push({
        key,
        provider: entry.provider,
        modelId: entry.modelId,
        ...(entry.displayName ? { displayName: entry.displayName } : {}),
      });
    }
  }
  return found.sort((a, b) => a.key.localeCompare(b.key));
}

/** Delete the given stored models and everything referencing them. */
export async function purgeBlocklistedStoredModels(
  models: BlocklistedStoredModel[],
): Promise<void> {
  await deleteModelRows(models.map((m) => m.key));
}
