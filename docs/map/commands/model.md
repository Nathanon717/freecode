# src/commands/model.ts - Interactive Model Picker

**Role:** Implements the interactive `/model` picker used by TTY sessions: provider fetch, the per-provider tabs, and the run loop. Pure rendering/data helpers live in [cli/model-screen.ts](../cli/model-screen.md).

## Exports

```typescript
getSelectableModels(): Promise<ModelMenuItem[]>

runModelCommand(
  rl: Interface,
  currentModel: string,
  setSelectedModel: (model: string) => void,
  onRestore?: () => void
): Promise<boolean>   // true if the picker was shown
```

`ModelMenuItem`, `filterModelItems`, and `buildAllItemLines` are re-exported from `cli/model-screen.ts` for a stable import surface.

Built on the shared menu layers: `cli/menu-shell.ts` owns the bottom-UI teardown/restore lifecycle (`onRestore` carries the session footer refresh — `applyModelChange`/`resetBottomPromptState`/`refreshFooterDailySpend`/`drawBottomUI`), and `cli/list-menu.ts` owns the nav loop and the windowed tab bar. The picker builds a **`♥` Favourites tab** (always leftmost, present when ≥1 favourite exists) plus **one tab per provider**. Each tab owns its own filter query, viewport, and `displayItems`; `groupMode`, the favorites set, and `actionMenu` are shared in the enclosing scope. `renderBody` wraps `buildScreen` (passing the reserved tab-bar rows and `showProviderHeaders`), `renderDetail` = `buildModelDetailScreen`, `actionMenu` = Select/View/Edit. Favourites (`←`), group cycle (`Tab`), filter typing/backspace, and Space-default are handled in `tab.onKey` (which ignores stray escape sequences so e.g. Up at the tab row never leaks into the filter), reading/writing the base-owned cursor via `ctx.getSelected`/`ctx.setSelected`. The picker opens on the Favourites tab when the current model is a favourite, otherwise on its provider tab. The interactive run loop lives in `runModelBody`.

## Model Discovery

`getSelectableModels()`:

1. Calls `initDynamicProviders()` so live provider model lists are current.
2. Adds every model from configured registry providers with an API key.
3. Attaches `pricing` to Anthropic and OpenAI models via `getAnthropicVerifiedRates` / `getOpenAIVerifiedRates` (both fetched in parallel). Agreed prices render green, single-source prices render yellow, and source disagreements render as red `sources disagree`.

The selected model string is always `providerId:modelId`.

## TTY Picker

`runModelCommand()` requires an interactive terminal. It draws a temporary raw-mode screen grouped by provider:

- Type printable characters to search across all models (all providers) by display name, model ID, or `provider:model`; when a filter is active the tab label turns grey, provider headers are shown, and the hint line highlights `filter` in the accent color. Backspace removes filter characters.
- Up/Down moves the selected row, wrapping at the ends.
- `←` toggles the selected model as a favorite. Favorites are keyed by the full `provider:model` ID and persisted to `favoriteModels` in the global config. They appear on the dedicated **♥ Favourites tab** (always leftmost), grouped by provider with white provider headers and the model's display name in the normal accent color. On each provider tab, favourited models have no special badge.
- `→` opens the model detail view showing pricing, traits, eval dots, and favorite status. `←` or Esc returns to the list.
- Enter opens an inline action sub-menu (shared `InlineActionMenu` from `cli/action-menu.ts`) with: **Select** (apply model for this session), **View** (open detail screen), **Edit** (stub).
- Space applies the selected `provider:model` and writes it as `defaultModel` in the global config.
- Esc closes without changing the model.
- Ctrl+C exits the process.

The command owns raw stdin only while the picker is open, then restores the readline interface before returning.

## Sort Flow

Before the main picker opens, `runModelCommand` checks for new models (from `model-cache.ts` `isNew` flag) that have no entry in `canonical-models.json`. If any exist, a sort flow runs first: for each unsorted model the user is shown a list of existing canonical groups to assign it to, or can type a new group name to create one. Results are saved to `canonical-models.json` and the picker then uses the updated groups for its model-grouped view.

## Canonical Groups Integration

The model-grouped tab view (`Tab` key) uses `canonical-models.json` (via `providers/canonical-models.ts`) for section headers. A model assigned to a canonical group always gets its own named section regardless of how many providers offer it (single-provider canonical models escape "Other"). The section header is the canonical name; each row shows the provider name.
