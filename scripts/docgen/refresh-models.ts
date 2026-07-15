#!/usr/bin/env tsx
// Deliberately refresh the committed model snapshot (src/providers/model-snapshot.json)
// from the live provider APIs. This is the ONE docs step that legitimately hits the
// network, so it is kept out of `npm test`/CI and run by hand when model lists change.
//
// After running, review the diff and run `npm run docs:generate` to update docs/providers.md.
//
// Merge safety: a provider is only overwritten when its live fetch returns a
// non-empty list. Providers whose API key is absent (or whose fetch failed) keep
// their previous snapshot entry, so running this on a machine missing some keys
// never silently wipes those providers.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PROVIDER_REGISTRY, initDynamicProviders } from '../../src/providers/provider-registry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SNAPSHOT_PATH = join(ROOT, 'src/providers/model-snapshot.json');

// Live providers are those with no static catalog models; only these are snapshotted.
const liveProviderIds = new Set(
  PROVIDER_REGISTRY.filter(p => p.models.length === 0).map(p => p.id),
);

const snapshot: Record<string, string[]> = existsSync(SNAPSHOT_PATH)
  ? (JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as Record<string, string[]>)
  : {};

await initDynamicProviders();

const refreshed: string[] = [];
const kept: string[] = [];
for (const provider of PROVIDER_REGISTRY) {
  if (!liveProviderIds.has(provider.id)) continue;
  if (provider.models.length === 0) {
    kept.push(provider.id);
    continue;
  }
  snapshot[provider.id] = provider.models
    .map(m => m.id)
    .sort((a, b) => a.localeCompare(b));
  refreshed.push(provider.id);
}

// Emit keys in provider-registry order so the snapshot mirrors the docs table.
const ordered = Object.fromEntries(
  PROVIDER_REGISTRY.filter(p => snapshot[p.id] !== undefined).map(p => [p.id, snapshot[p.id]]),
);
writeFileSync(SNAPSHOT_PATH, JSON.stringify(ordered, null, 2) + '\n', 'utf-8');

console.log(`Refreshed: ${refreshed.join(', ') || '(none)'}`);
if (kept.length > 0) {
  console.log(`Kept prior snapshot (no key / empty fetch): ${kept.join(', ')}`);
}
console.log('Now run `npm run docs:generate` and review the diff.');
