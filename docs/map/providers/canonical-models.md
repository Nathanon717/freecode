# src/providers/canonical-models.ts — Canonical Model Groups

**Purpose:** Load, save, and query the user-maintained canonical model groups that map human-readable display names to `provider:modelId` strings. The file `canonical-models.json` lives in the project root (alongside `package.json`), so it can be hand-edited and committed.

**Read when:** Touching the model picker sort flow, the model-grouped tab view (section headers), or the canonical-models.json format.

**Exports:**
- `CanonicalModelGroups` — `Record<string, string[]>` (canonical name → `["provider:modelId", …]`)
- `loadCanonicalGroups()` — reads canonical-models.json; returns `{}` if missing or invalid
- `saveCanonicalGroups(groups)` — writes canonical-models.json at the project root
- `getCanonicalGroupKey(providerId, modelId, groups)` — reverse lookup; returns canonical name or `undefined`
- `addToCanonicalGroup(name, providerId, modelId, groups)` — pure; returns updated groups

**Key neighbors:** `model-cache.ts` (same config-dir pattern), `commands/model.ts` (uses all exports for the sort flow and grouped picker view).

**Update triggers:** If the JSON schema changes (e.g. adding per-group metadata), update this file's type and any callers in `commands/model.ts`.
