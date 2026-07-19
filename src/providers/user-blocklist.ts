import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { getConfigDir } from '../config/index.js';
import { logError } from '../logger.js';

/**
 * Per-user model blocklist: the models this machine's user never wants offered.
 *
 * Distinct from the `modelIdBlocklist` / `modelIdExactBlocklist` arrays in
 * `provider-catalog.ts`, which are shipped, hand-curated defaults meaning "this
 * model is broken for everyone". This file is the personal counterpart, written
 * by the model picker's "Remove Fully" action and safe to hand-edit — it is a
 * flat list of `provider:modelId` keys and nothing else, so the file itself is
 * the viewing/editing UI.
 */

function blocklistPath(): string {
  return join(getConfigDir(), 'blocklist.json');
}

let cached: Set<string> | null = null;

/** Keys (`provider:modelId`) the user has permanently blocklisted. */
export function getUserBlocklist(): Set<string> {
  if (cached) return cached;
  cached = new Set<string>();
  const path = blocklistPath();
  try {
    if (existsSync(path)) {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
      // Hand-edited file: keep only well-formed entries rather than throwing out
      // the whole list because one line is wrong.
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (typeof entry === 'string' && entry.includes(':')) cached.add(entry);
        }
      }
    }
  } catch (err) {
    logError('registry', `Failed to load ${path}`, err);
  }
  return cached;
}

/** True if `provider:modelId` is on the user blocklist. */
export function isUserBlocklisted(providerId: string, modelId: string): boolean {
  return getUserBlocklist().has(`${providerId}:${modelId}`);
}

/** Add a key to the blocklist and persist it. No-op if already present. */
export function addToUserBlocklist(key: string): void {
  const list = getUserBlocklist();
  if (list.has(key)) return;
  list.add(key);
  const path = blocklistPath();
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify([...list].sort(), null, 2), 'utf-8');
  } catch (err) {
    logError('registry', `Failed to write ${path}`, err);
  }
}

/** Drop the in-memory copy so the next read re-reads the file. Tests only. */
export function resetUserBlocklistCache(): void {
  cached = null;
}
