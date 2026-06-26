# src/cli/model-screen.ts - Model Picker Screen Renderers

**Role:** Pure rendering + data helpers for the `/model` picker. Holds the `ModelMenuItem` shape and every function that turns model lists into screen lines, with no terminal/raw-mode or provider-fetch logic.

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
  isFavorite?: boolean;
  pricing?: { input: number | null; output: number | null; confidence: PricingConfidence };
  evalDots?: string;
  rateLimits?: { buckets: Record<string, { limit: number; intervalMs: number | null }>; observedAt: string };
}

modelPreference(item: ModelMenuItem): string

sortItemsAlphabetically(items: ModelMenuItem[]): void

filterModelItems(items: ModelMenuItem[], query: string): ModelMenuItem[]

buildAllItemLines(items: ModelMenuItem[], selected: number, currentModel: string, showProviderHeaders?: boolean): { itemLines: string[]; selectedLineIdx: number; }

buildScreen(items: ModelMenuItem[], selected: number, currentModel: string, viewStart: number, filterQuery: string, reserveRows?: number, showProviderHeaders?: boolean): { lines: string[]; newViewStart: number; selectedScreenIdx: number; }

buildModelDetailScreen(item: ModelMenuItem): string[]
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `modelPreference(item)` — returns `${providerId}:${modelId}`.
- `sortItemsAlphabetically(items)` — sorts in-place, alphabetical by displayName within each provider group.
- `buildScreen` — sizes the body to the terminal height minus `reserveRows` (caller passes the tab-bar height when the picker is multi-provider so the body never overflows); off-screen rows are flagged with `↑ N more above` / `↓ N more below`.
- `showProviderHeaders` (default `true`): when `false`, provider name headers are omitted and favorites render in gold; when `true`, provider headers group the list and model names render in the normal accent color.

## Read when

- Changing how model rows, the Favorites section, pricing/eval/`~tools` badges, the scroll indicators, or the model detail screen look.
- Adjusting filtering, sort order, or the `showProviderHeaders` flag that controls provider headers and gold-highlight behavior.

## Key neighbors

- Consumed by [commands/model.ts](../commands/model.md), which owns provider fetch (`getSelectableModels`), the per-provider tabs, and the run loop. It re-exports `ModelMenuItem` / `filterModelItems` / `buildAllItemLines` for a stable surface.
- Uses [cli/banner.ts](banner.md) `getBannerColor` for accents.

## Update triggers

- New `ModelMenuItem` field or badge.
- Row/section layout or scroll-indicator changes.
