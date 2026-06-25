# src/eval/playground.ts - Playground Scenario Discovery and Hashing

**Role:** Discovers playground eval scenarios from the filesystem, provides content hashing for cache-invalidation, and defines the shared `modelSlug` helper.

## Exports

| Symbol | Description |
|--------|-------------|
| `PLAYGROUND_EVAL_DIR` | Absolute path to `playground/eval/`. |
| `PlaygroundScenario` | `{ id, firstLine }` for a discovered playground scenario. |
| `modelSlug(model)` | Converts `provider:model` to `provider--model` for use as a filename/dir name. |
| `discoverPlaygroundScenarios()` | Lists numbered/named scenario folders in `playground/eval/` that have `prompt.md` and `eval/check.ts`, sorted by name. |
| `computeRunHash(scenarioDir)` | Hashes only prompt, config, and start files — excludes eval/ so scoring changes don't invalidate stored results. |
| `computeScenarioHash(scenarioDir)` | Full hash including eval/ files. Retained for grandfathering entries written before the run-hash split. |

## Key Facts

- No chalk imports — pure data/IO.
- `computeRunHash` is used as the canonical `scenarioHash` for new history entries.
- `computeScenarioHash` matches older entries that were hashed before the run/full split.

## Read When

- Changing scenario discovery rules (folder naming conventions, required files).
- Changing what inputs are hashed (adding/removing files from the hash).
- Understanding `modelSlug` for artifact directory naming.
