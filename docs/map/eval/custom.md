# src/eval/custom.ts - Custom Eval Discovery and Hashing

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Discovers custom eval scenarios from the filesystem, provides content hashing for cache-invalidation, and defines the shared `modelSlug` helper.

## Read When

- Changing scenario discovery rules (folder naming conventions, required files).
- Changing what inputs are hashed (adding/removing files from the hash).
- Understanding `modelSlug` for artifact directory naming.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Absolute path to `evals/custom/`.
 */
CUSTOM_EVAL_DIR: string

interface CustomEval {
  id: string;
  firstLine: string;
}

/**
 * `provider:model` → `provider--model`, for filesystem artifact directory naming.
 */
modelSlug(model: string): string

/**
 * Scenarios with both a `prompt.md` and an `eval/check.ts`, sorted by folder name.
 */
discoverCustomEvals(): CustomEval[]

/**
 * Hash of what the agent sees and does (prompt, config, start files). Excludes
 * `eval/`, so scoring changes do not invalidate stored results.
 */
computeRunHash(scenarioDir: string): string

/**
 * Full hash including `eval/` — retained for entries hashed before the run-hash split.
 */
computeScenarioHash(scenarioDir: string): string
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`util/text-encoding.ts`](../util/text-encoding.md) ×1
- **Imported by:** [`cli/eval/eval-menu.ts`](../cli/eval/eval-menu.md) ×6, [`cli/eval/custom-eval-menu.ts`](../cli/eval/custom-eval-menu.md) ×5, [`eval/history.ts`](history.md) ×5, [`cli/eval/eval-screen.ts`](../cli/eval/eval-screen.md) ×2, [`eval/runner.ts`](runner.md) ×1

## Tests

`tests/eval/custom.test.ts`. 4 other test files reference it.

## Budget

100 / 500 lines (400 to spare).
<!-- END GENERATED MAP FACTS -->

## Key Facts

- No chalk imports — pure data/IO.
- `computeRunHash` is used as the canonical `scenarioHash` for new history entries.
- `computeScenarioHash` matches older entries that were hashed before the run/full split.
