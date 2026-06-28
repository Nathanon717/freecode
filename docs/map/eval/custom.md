# src/eval/custom.ts - Custom Eval Discovery and Hashing

**Role:** Discovers custom eval scenarios from the filesystem, provides content hashing for cache-invalidation, and defines the shared `modelSlug` helper.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
CUSTOM_EVAL_DIR: string

interface CustomEval {
  id: string;
  firstLine: string;
}

modelSlug(model: string): string

discoverCustomEvals(): CustomEval[]

computeRunHash(scenarioDir: string): string

computeScenarioHash(scenarioDir: string): string
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `CUSTOM_EVAL_DIR`: Absolute path to `evals/custom/`.
- `modelSlug`: Converts `provider:model` to `provider--model` for filesystem artifact directory naming.
- `discoverCustomEvals`: Requires `prompt.md` and `eval/check.ts` to be present; sorted by folder name.
- `computeRunHash`: Excludes `eval/` so scoring changes do not invalidate stored results.
- `computeScenarioHash`: Includes `eval/` files; retained for grandfathered entries hashed before the run-hash split.

## Key Facts

- No chalk imports — pure data/IO.
- `computeRunHash` is used as the canonical `scenarioHash` for new history entries.
- `computeScenarioHash` matches older entries that were hashed before the run/full split.

## Read When

- Changing scenario discovery rules (folder naming conventions, required files).
- Changing what inputs are hashed (adding/removing files from the hash).
- Understanding `modelSlug` for artifact directory naming.
