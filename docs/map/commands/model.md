# src/commands/model.ts - Interactive Model Picker

**Role:** Implements the interactive `/model` picker used by TTY sessions: provider fetch, the per-provider tabs, and the run loop. Pure rendering/data helpers live in [cli/model-screen.ts](../cli/model-screen.md).

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
export { type ModelMenuItem, filterModelItems, buildAllItemLines } from '../cli/model-screen.js'

getSelectableModels(): Promise<ModelMenuItem[]>

runModelCommand(rl: Interface, currentModel: string, setSelectedModel: (model: string) => void, onRestore?: (() => void) | undefined): Promise<boolean>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `ModelMenuItem`, `filterModelItems`, and `buildAllItemLines` are re-exported from `cli/model-screen.ts` for a stable import surface.

Built on the shared menu layers: `cli/menu-shell.ts` owns the bottom-UI teardown/restore lifecycle (`onRestore` carries the session footer refresh — `applyModelChange`/`resetBottomPromptState`/`refreshFooterDailySpend`/`drawBottomUI`), and `cli/list-menu.ts` owns the nav loop and the windowed tab bar. The picker builds a **`♥` Favourites tab** (always leftmost, present when ≥1 favourite exists) plus **one tab per provider**. Each tab owns its own filter query, viewport, and `displayItems`; the favorites set and `actionMenu` are shared in the enclosing scope. `renderBody` wraps `buildScreen` (passing the reserved tab-bar rows and `showProviderHeaders`), `renderDetail` = `buildModelDetailScreen`, `actionMenu` = Select/View/Edit. Favourites (`←`), filter typing/backspace, and Space-default are handled in `tab.onKey` (which ignores stray escape sequences so e.g. Up at the tab row never leaks into the filter), reading/writing the base-owned cursor via `ctx.getSelected`/`ctx.setSelected`. The picker opens on the Favourites tab when the current model is a favourite, otherwise on its provider tab. The interactive run loop lives in `runModelBody`.

## Model Discovery

`getSelectableModels()`:

1. Calls `initDynamicProviders()` so live provider model lists are current.
2. Adds every model from configured registry providers with an API key.
3. Attaches `pricing` to Anthropic and OpenAI models via `getAnthropicVerifiedRates` / `getOpenAIVerifiedRates` (both fetched in parallel). Agreed prices render green, single-source prices render yellow, and source disagreements render as red `sources disagree`.

The selected model string is always `providerId:modelId`.

## TTY Picker

`runModelCommand()` requires an interactive terminal. It draws a temporary raw-mode screen grouped by provider:

- Type printable characters to search across all models (all providers) by display name, model ID, or `provider:model`; when a filter is active the tab label turns grey, provider headers are shown, and the hint line highlights `filter` in the accent color. Backspace removes filter characters.
- Up/Down moves the selected row; stops at the top/bottom (no wrap-around).
- `←` toggles the selected model as a favorite. Favorites are keyed by the full `provider:model` ID and persisted to `favoriteModels` in the global config. They appear on the dedicated **♥ Favourites tab** (always leftmost), grouped by provider with white provider headers and the model's display name in the normal accent color. On each provider tab, favourited models have no special badge.
- `→` opens the model detail view showing pricing, traits, eval dots, and favorite status. `←` or Esc returns to the list.
- Enter opens an inline action sub-menu (shared `InlineActionMenu` from `cli/action-menu.ts`) with: **Select** (apply model for this session), **View** (open detail screen), **Edit** (stub).
- Space applies the selected `provider:model` and writes it as `defaultModel` in the global config.
- Esc closes without changing the model.
- Ctrl+C exits the process.

The command owns raw stdin only while the picker is open, then restores the readline interface before returning.
