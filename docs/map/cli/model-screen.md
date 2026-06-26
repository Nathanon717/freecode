# src/cli/model-screen.ts - Model Picker Screen Renderers

**Role:** Pure rendering + data helpers for the `/model` picker. Holds the `ModelMenuItem` shape and every function that turns model lists into screen lines, with no terminal/raw-mode or provider-fetch logic.

## Read when

- Changing how model rows, the Favorites section, pricing/eval/`~tools` badges, the scroll indicators, or the model detail screen look.
- Adjusting filtering, sort order, or the `showProviderHeaders` flag that controls provider headers and gold-highlight behavior.

## Exports

```typescript
interface ModelMenuItem { providerId; providerName; modelId; displayName; modelsSource?; isNew?; noNativeTools?; isFavorite?; pricing?; evalDots?; rateLimits? }
type GroupMode = 'pretty' | 'provider'
modelPreference(item)            // `${providerId}:${modelId}`
sortItemsAlphabetically(items)   // in-place: alphabetical by displayName within each provider group
filterModelItems(items, query)
buildAllItemLines(items, selected, currentModel, groupMode?, showProviderHeaders?)
buildScreen(items, selected, currentModel, viewStart, groupMode, filterQuery, reserveRows?, showProviderHeaders?)
buildModelDetailScreen(item)
```

- `buildScreen` sizes the body to the terminal height minus `reserveRows` (the caller passes the tab-bar height when the picker is multi-provider, so the body never overflows). Off-screen rows are flagged with `↑ N more above` / `↓ N more below`.
- `showProviderHeaders` (default `true`): when `false`, provider name headers are omitted and favorites render in gold; when `true` (favourites tab), provider headers group the list and model names render in the normal accent color.

## Key neighbors

- Consumed by [commands/model.ts](../commands/model.md), which owns provider fetch (`getSelectableModels`), the per-provider tabs, and the run loop. It re-exports `ModelMenuItem` / `filterModelItems` / `buildAllItemLines` for a stable surface.
- Uses [cli/banner.ts](banner.md) `getBannerColor` for accents.

## Update triggers

- New `ModelMenuItem` field or badge.
- Row/section layout or scroll-indicator changes.
