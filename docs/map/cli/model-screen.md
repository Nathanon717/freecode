# src/cli/model-screen.ts - Model Picker Screen Renderers

**Role:** Pure rendering + data helpers for the `/model` picker. Holds the `ModelMenuItem` shape and every function that turns model lists into screen lines, with no terminal/raw-mode or provider-fetch logic.

## Read when

- Changing how model rows, the Favorites section, pricing/eval/`~tools` badges, the scroll indicators, or the model detail screen look.
- Adjusting filtering, favorite sorting, or the displayItems (`_favSection`) duplication model.

## Exports

```typescript
interface ModelMenuItem { providerId; providerName; modelId; displayName; modelsSource?; isNew?; noNativeTools?; isFavorite?; _favSection?; pricing?; evalDots?; rateLimits? }
type GroupMode = 'pretty' | 'provider'
modelPreference(item)            // `${providerId}:${modelId}`
sortItemsByFavorites(items)      // in-place: favorites first within each provider group
buildDisplayList(items)          // prepends _favSection=true copies of favorites
filterModelItems(items, query)
buildAllItemLines(items, selected, currentModel, groupMode?)
buildScreen(items, selected, currentModel, viewStart, groupMode, filterQuery, reserveRows?)
buildModelDetailScreen(item)
```

- `buildScreen` sizes the body to the terminal height minus `reserveRows` (the caller passes the tab-bar height when the picker is multi-provider, so the body never overflows). Off-screen rows are flagged with `↑ N more above` / `↓ N more below`.

## Key neighbors

- Consumed by [commands/model.ts](../commands/model.md), which owns provider fetch (`getSelectableModels`), the per-provider tabs, and the run loop. It re-exports `ModelMenuItem` / `filterModelItems` / `buildAllItemLines` for a stable surface.
- Uses [cli/banner.ts](banner.md) `getBannerColor` for accents.

## Update triggers

- New `ModelMenuItem` field or badge.
- Row/section layout or scroll-indicator changes.
