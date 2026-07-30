# src/commands/model.ts - Interactive Model Picker

**Role:** Implements the interactive `/model` picker used by TTY sessions: provider fetch, the per-provider tabs, and the run loop. Pure rendering/data helpers live in [cli/menus/model-screen.ts](../cli/menus/model-screen.md).

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
export { type ModelMenuItem, filterModelItems, buildAllItemLines } from '../cli/menus/model-screen.js'

getSelectableModels(includeRemoved?: boolean): Promise<ModelMenuItem[]>

runModelCommand(rl: Interface, currentModel: string, setSelectedModel: (model: string) => void, onRestore?: (() => void) | undefined): Promise<boolean>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `ModelMenuItem`, `filterModelItems`, and `buildAllItemLines` are re-exported from `cli/menus/model-screen.ts` for a stable import surface.

Built on the shared menu layers ([menu-shell](../cli/menus/menu-shell.md), [list-menu](../cli/menus/list-menu.md); `onRestore` carries the session footer refresh — `applyModelChange`/`resetBottomPromptState`/`refreshFooterDailySpend`/`drawBottomUI`). The picker builds a **`♥` Favourites tab** (leftmost, present when ≥1 favourite exists), one tab per provider, and a **`⊘` Removed tab** (always present, always last). Each tab owns its filter query, viewport, and `displayItems`; the favorites set and `actionMenu` are shared in the enclosing scope. `renderBody` wraps `buildScreen` (reserved tab-bar rows, `showProviderHeaders`), `renderDetail` = `buildModelDetailScreen`, `actionMenu` = Select/View/Edit/Remove (the Removed tab uses a second `InlineActionMenu` instance with Restore in place of Remove). Favourites (`←`), filter typing/backspace, and Space-default are handled in `tab.onKey` (both `←` and Space-default are gated off on the Removed tab) (ignores stray escape sequences so e.g. Up at the tab row never leaks into the filter), via `ctx.getSelected`/`ctx.setSelected`. Opens on Favourites tab if the current model is a favourite, else its provider tab. Run loop: `runModelBody`.

## Model Discovery

`getSelectableModels()`:

1. Calls `initDynamicProviders()` so live provider model lists are current.
2. Adds every model from configured registry providers with an API key.
3. Attaches `pricing` to Anthropic and OpenAI models via `getAnthropicVerifiedRates` / `getOpenAIVerifiedRates` (both fetched in parallel). Agreed prices render green, single-source prices render yellow, and source disagreements render as red `sources disagree`.
4. Flags any `provider:model` key marked `removed` (`getRemovedKeys()`) and filters those out before returning. `includeRemoved: true` keeps them in the list (still flagged) — only `runModelBody` passes it, splitting the result into `items` / `removedItems` so the Removed tab has something to show. Pricing is resolved for visible models only, so a just-restored model has no pricing badge until the picker is reopened.

The selected model string is always `providerId:modelId`.

## TTY Picker

`runModelCommand()` requires an interactive terminal. It draws a temporary raw-mode screen grouped by provider:

- Typing searches all providers by display name, model ID, or `provider:model` (filter active → grey tab label, provider headers shown, hint line highlights `filter`). Backspace removes filter characters.
- Up/Down moves selection; stops at top/bottom (no wrap-around).
- `←` toggles favorite, keyed by `provider:model`, persisted to `favoriteModels` in global config; shown on the **♥ Favourites tab** (no badge on provider tabs).
- The **⊘ Removed tab** lists removed models grouped by provider (like Favourites), with no global-filter escape — typing there never surfaces non-removed models. Empty body reads `No removed models`.
- `→` opens model detail (pricing, traits, eval dots, favorite status). `←`/Esc returns to the list.
- Enter opens `InlineActionMenu` (from `cli/menus/action-menu.ts`): **Select** (apply for session), **View** (detail screen), **Edit** (stub), **Remove** / **Restore** (sets `removed` via `setRemoved` and moves the item between the `items` and `removedItems` arrays in place, re-sorting the destination; no confirmation prompt).
- **Remove Fully** is offered on the Removed tab only, below Restore. It is the irreversible one: the model's key goes on the per-user blocklist ([providers/user-blocklist.md](../providers/user-blocklist.md)) via `blocklistModelPermanently`, then `deleteModelRows` ([store/db.md](../store/db.md)) cascade-deletes its `models` row and everything referencing it. Both halves are load-bearing — the cascade delete drops the `removed` flag too, so without the blocklist entry a live re-fetch would resurrect the model as a fresh normal entry.
- The Remove Fully confirmation is a second `InlineActionMenu` (`Cancel` / `Delete permanently`, Cancel first so the destructive option is never the default) that swaps in via **getters** on `tab.actionMenu.menu` / `.actionHint` — `list-menu` reads both on every render and key, so the tab can replace its own menu without the base knowing. `list-menu` never reports an Esc out of action mode, so `confirming` is cleared on every fresh Enter in `tab.onKey` rather than on exit; skip that and the next Enter reopens the confirmation.
- Space applies the selected `provider:model` as `defaultModel` in global config.
- Esc closes without changing the model.
- Ctrl+C exits the process.

The command owns raw stdin only while the picker is open, then restores the readline interface before returning.
