import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Record<canonical display name, ["provider:modelId", ...]>
export type CanonicalModelGroups = Record<string, string[]>;

const _dirname = dirname(fileURLToPath(import.meta.url));
// Resolves to the project root (two levels up from dist/providers/ at runtime).
const CANONICAL_PATH = resolve(_dirname, '..', '..', 'canonical-models.json');

export function loadCanonicalGroups(): CanonicalModelGroups {
  if (!existsSync(CANONICAL_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CANONICAL_PATH, 'utf-8')) as CanonicalModelGroups;
  } catch {
    return {};
  }
}

export function saveCanonicalGroups(groups: CanonicalModelGroups): void {
  writeFileSync(CANONICAL_PATH, JSON.stringify(groups, null, 2) + '\n', 'utf-8');
}

// Returns the canonical group name for a provider:modelId, or undefined if not assigned.
export function getCanonicalGroupKey(
  providerId: string,
  modelId: string,
  groups: CanonicalModelGroups,
): string | undefined {
  const entry = `${providerId}:${modelId}`;
  for (const [name, members] of Object.entries(groups)) {
    if (members.includes(entry)) return name;
  }
  return undefined;
}

// Pure: returns updated groups with the model added to the named group (creates if absent).
export function addToCanonicalGroup(
  groupName: string,
  providerId: string,
  modelId: string,
  groups: CanonicalModelGroups,
): CanonicalModelGroups {
  const entry = `${providerId}:${modelId}`;
  const existing = groups[groupName] ?? [];
  if (existing.includes(entry)) return groups;
  return { ...groups, [groupName]: [...existing, entry] };
}

// Called after a live provider fetch. Appends any unseen model IDs to the "other"
// key so the user can see and organise them. Static providers should not call this.
export function syncLiveModels(providerId: string, modelIds: string[]): void {
  if (modelIds.length === 0) return;
  try {
    const groups = loadCanonicalGroups();
    const allEntries = new Set(Object.values(groups).flat());
    const unseen = modelIds
      .map(id => `${providerId}:${id}`)
      .filter(entry => !allEntries.has(entry));
    if (unseen.length === 0) return;
    const other = groups['other'] ?? [];
    saveCanonicalGroups({ ...groups, other: [...other, ...unseen] });
  } catch {
    // Never break model loading if the file can't be written.
  }
}
