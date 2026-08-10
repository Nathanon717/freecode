# src/cli/menus/model-screen.ts - Model Picker Screen Renderers

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Pure rendering + data helpers for the `/model` picker. Holds the `ModelMenuItem` shape and every function that turns model lists into screen lines, with no terminal/raw-mode or provider-fetch logic.

## Read When

- Changing how model rows, the Favorites section, pricing/eval/`~tools`/`◉` (exact-tokenizer eye) badges, the scroll indicators, or the model detail screen look. The eye badge is banner-tinted and driven by `ModelMenuItem.exactTokenizer`, which `commands/model.ts` fills from `tokenizers/count.ts`'s `hasExactTokenizer`.
- Adjusting filtering, sort order, or the `showProviderHeaders` flag that controls provider headers and gold-highlight behavior.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface ModelMenuItem {
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
  modelsSource?: 'static' | 'live';
  isNew?: boolean;
  noNativeTools?: boolean;
  exactTokenizer?: boolean;
  isFavorite?: boolean;
  removed?: boolean;
  // DB-backed columns carried purely so the detail screen can show every stored
  // value (including the unset ones). `undefined` means "no row / column null".
  contextWindow?: number | null;
  nativeTools?: boolean;
  settings?: OverridableSettings;
  pricing?: { input: number | null; output: number | null; confidence: PricingConfidence };
  evalDots?: string;
  rateLimits?: { buckets: Record<string, { limit: number; intervalMs: number | null }>; observedAt: string };
}

/**
 * The `provider:model` preference string, `${providerId}:${modelId}`.
 */
modelPreference(item: ModelMenuItem): string

/**
 * Sort in place, alphabetical by `displayName` within each provider group.
 */
sortItemsAlphabetically(items: ModelMenuItem[]): void

filterModelItems(items: ModelMenuItem[], query: string): ModelMenuItem[]

/**
 * `showProviderHeaders` (default `true`) groups the list under provider name
 * headers and renders model names in the normal accent colour. When `false` the
 * headers are omitted and favourites render in gold.
 */
buildAllItemLines(items: ModelMenuItem[], selected: number, currentModel: string, showProviderHeaders?: boolean): { itemLines: string[]; selectedLineIdx: number; }

/**
 * Size the body to the terminal height minus `reserveRows` — the caller passes
 * the tab-bar height when the picker is multi-provider, so the body never
 * overflows — and flag off-screen rows with `↑ N more above` / `↓ N more below`.
 * `emptyMessage` overrides the empty-list body text (default `No models match the
 * current filter`; the Removed tab passes `No removed models` when unfiltered).
 */
buildScreen(items: ModelMenuItem[], selected: number, currentModel: string, viewStart: number, filterQuery: string, reserveRows?: number, showProviderHeaders?: boolean, emptyMessage?: string): { ...; }

/**
 * The `View` / `→` detail screen. Every `models` DB column gets a row whether or
 * not it holds a value (`—` when null/unset) — ID, Provider, Display, Context,
 * Native tools, Favorite, Removed, Settings, Rate limits — so the screen is a
 * faithful view of the stored row rather than only its populated half. Derived,
 * non-stored facts (Pricing, Tokenizer, Eval dots, Traits, Status) stay
 * conditional.
 */
buildModelDetailScreen(item: ModelMenuItem): string[]
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/render/banner.ts`](../render/banner.md) ×5, [`cli/theme.ts`](../theme.md) ×1, [`providers/pricing-verifier.ts`](../../providers/pricing-verifier.md) ×1, [`providers/types.ts`](../../providers/types.md) ×1
- **Imported by:** [`commands/model.ts`](../../commands/model.md) ×32

## Tests

`tests/cli/menus/model-screen.test.ts`.

## Budget

252 / 500 lines (248 to spare).
<!-- END GENERATED MAP FACTS -->

## Key neighbors

- Consumed by [commands/model.ts](../../commands/model.md), which owns provider fetch (`getSelectableModels`), the per-provider tabs, and the run loop. It re-exports `ModelMenuItem` / `filterModelItems` / `buildAllItemLines` for a stable surface.
- Uses [cli/render/banner.ts](../render/banner.md) `getBannerColor` for accents.

## Update triggers

- New `ModelMenuItem` field or badge.
- Row/section layout or scroll-indicator changes.
