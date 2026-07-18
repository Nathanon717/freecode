# Provider-level overrides had to be re-set constantly (wiped by any global setting write)

**Report:** "I've set *Load AGENTS.md* as a provider-level override for `zen` a
million times now. It should be set once and apply forever across all devices."

**Cause (`src/config/index.ts:174`):** `writeConfigFile` synced the DB from
`data.providerOverrides ?? {}`. That conflated two different things — *the caller
never mentioned providerOverrides* and *the caller wants them cleared*. The DB is
the cross-device source of truth for overrides, so on any device that received an
override via sync, `config.json` on disk has no `providerOverrides` key.
`updateGlobalConfig` reads that raw file, spreads a patch over it, and hands the
result back — `providerOverrides` is `undefined`, becomes `{}`, and
`persistDbConfig('providerOverrides', {})` clobbers the DB row. So **saving any
global setting silently deleted every provider override, on every device.**

Note the asymmetry that made it visible: `newGlobal` was merged with
`existingCache.global` a line below; `providerOverrides` was replaced wholesale.

**Second, smaller leak (`src/commands/config.ts`):** `saveOverrideSetting` seeded
its override map from `readRawConfig(globalPath)` — the same stale local file — so
setting one provider's override dropped any *other* provider's override that
existed only in the DB.

**Fix:**
- `writeConfigFile` falls back to `existingCache.providerOverrides` when the field
  is omitted. Omitted now means "untouched"; an explicit map (including `{}`)
  still replaces.
- `saveOverrideSetting` seeds from `loadConfig().providerOverrides` (DB-merged,
  deep-copied so the config cache isn't mutated) and always writes an explicit
  map rather than `delete`-ing the key.

**Trap avoided:** simply merging `providerOverrides` with the existing DB copy —
the symmetric-looking fix — would make *turning an override off* impossible.
Deletion is signalled by the key's absence from the map, so a shallow merge
resurrects it. Disambiguating omitted-vs-explicit is what keeps both directions
working, hence the paired tests.

**Coverage:** `tests/config/index.test.ts` — a global write preserves DB provider
overrides (this test failed with `{}` before the fix), and an explicit empty map
still clears them.
