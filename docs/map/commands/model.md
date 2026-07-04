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

Built on the shared menu layers ([menu-shell](../cli/menu-shell.md), [list-menu](../cli/list-menu.md); `onRestore` carries the session footer refresh — `applyModelChange`/`resetBottomPromptState`/`refreshFooterDailySpend`/`drawBottomUI`). The picker builds a **`♥` Favourites tab** (leftmost, present when ≥1 favourite exists) plus one tab per provider. Each tab owns its filter query, viewport, and `displayItems`; the favorites set and `actionMenu` are shared in the enclosing scope. `renderBody` wraps `buildScreen` (reserved tab-bar rows, `showProviderHeaders`), `renderDetail` = `buildModelDetailScreen`, `actionMenu` = Select/View/Edit. Favourites (`←`), filter typing/backspace, and Space-default are handled in `tab.onKey` (ignores stray escape sequences so e.g. Up at the tab row never leaks into the filter), via `ctx.getSelected`/`ctx.setSelected`. Opens on Favourites tab if the current model is a favourite, else its provider tab. Run loop: `runModelBody`.

## Model Discovery

`getSelectableModels()`:

1. Calls `initDynamicProviders()` so live provider model lists are current.
2. Adds every model from configured registry providers with an API key.
3. Attaches `pricing` to Anthropic and OpenAI models via `getAnthropicVerifiedRates` / `getOpenAIVerifiedRates` (both fetched in parallel). Agreed prices render green, single-source prices render yellow, and source disagreements render as red `sources disagree`.

The selected model string is always `providerId:modelId`.

## TTY Picker

`runModelCommand()` requires an interactive terminal. It draws a temporary raw-mode screen grouped by provider:

- Typing searches all providers by display name, model ID, or `provider:model` (filter active → grey tab label, provider headers shown, hint line highlights `filter`). Backspace removes filter characters.
- Up/Down moves selection; stops at top/bottom (no wrap-around).
- `←` toggles favorite, keyed by `provider:model`, persisted to `favoriteModels` in global config; shown on the **♥ Favourites tab** (no badge on provider tabs).
- `→` opens model detail (pricing, traits, eval dots, favorite status). `←`/Esc returns to the list.
- Enter opens `InlineActionMenu` (from `cli/action-menu.ts`): **Select** (apply for session), **View** (detail screen), **Edit** (stub).
- Space applies the selected `provider:model` as `defaultModel` in global config.
- Esc closes without changing the model.
- Ctrl+C exits the process.

The command owns raw stdin only while the picker is open, then restores the readline interface before returning.
