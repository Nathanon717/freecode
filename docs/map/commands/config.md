# src/commands/config.ts - Interactive Config Editor

**Role:** Implements the `/config` terminal UI for editing settings at global, provider, and model levels.

Built on the shared menu layers ([menu-shell](../cli/menu-shell.md), [list-menu](../cli/list-menu.md)). Each config tab is a `MenuTab` whose `onKey` cycles the focused setting's value (no `actionMenu`/`renderDetail`). `wrap: false` matches the editor's non-wrapping navigation.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
runConfigCommand(rl: Interface, currentModel?: string, onRestore?: (() => void) | undefined): Promise<void>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `runConfigCommand`: `onRestore` carries session footer refresh (`resetBottomPromptState`/`refreshFooterDailySpend`/`drawBottomUI`) that can't move into this module; the shell fires it after `setupBottomUI` when the bottom UI was active on a TTY.

## Tabs

Three tabs, navigated by pressing Up from the first setting row to reach the tab row, then Left/Right to switch:

| Tab | Scope | Stored in |
|-----|-------|-----------|
| Global | All providers/models | `config.json` top-level keys |
| Provider | Current provider | `config.json` `providerOverrides[providerId]` |
| Model | Current `provider:model` | `.freecode/models.json` `settings` (sparse) via `model-data` |

Provider and Model tabs are only available when `currentModel` contains a colon. If no model is selected, only Global is shown and no tab chrome is drawn.

## Settings

| Key | Label | Tabs | Behavior |
|-----|-------|------|----------|
| `toolRationale` | Tool rationale | Global, Provider, Model | Explain each tool call before executing. |
| `showProviderUsage` | Provider usage | Global, Provider, Model | Print token/rate-limit usage after each turn. |
| `parallelTools` | Parallel tools | Global, Provider, Model | Allow multiple tool calls per response. |
| `retryMaxWaitSeconds` | Max retry wait | Global only | Max seconds before retrying a rate-limited request. |
| `diffContextLines` | Diff context | Global only | Context lines shown around each edit diff. |
| `showEvalDots` | Eval dots | Global only | Show per-scenario eval circles in the model picker. |
| `autoApproveTokenBudget` | Auto-approve under | Global, Provider, Model | Numeric (0–1000, step 100). Auto-approve `read`/`grep`/`list_dir` calls adding fewer than N tokens. `0` renders dim **off**. The only numeric setting that is also overridable. |
| `loadAgentsMd` | Load AGENTS.md | Provider, Model | Inject AGENTS.md into the system prompt. Hidden from Global to preserve layout. |
| `parsedTools` | Parsed tools | Model only | Text `<tool_call>` protocol instead of native function calling. `modelTabOnly`. Auto-detected (native tools rejected) shows **true (auto-detected)** and blocks cycling — can't be turned off. |

`globalOnly` settings are hidden in Provider and Model tabs. `modelOnly` settings are hidden in the Global tab. `modelTabOnly` settings are hidden from Global and Provider tabs (visible only on the Model tab).

## Override values

Global tab cycles: `true ↔ false`.  
Provider/Model tabs cycle: `inherit → true → false → inherit` (Right) or `inherit → false → true → inherit` (Left). `inherit` means the key is absent from the override record, so the parent level's value applies.

Numeric settings step instead of cycling. Global tab: `cycleNumeric` clamps to `[min, max]`. Provider/Model tabs: `cycleNumericOverride` puts `inherit` one rung below `min`, so Left from `min` clears the override and Right from `inherit` adopts `min`; both ends **clamp** rather than wrap, so a held arrow key can't roll past the max back to `inherit`. Only the current value is rendered (there is no room to show every rung), unlike the boolean cycle which shows all three choices.

`loadOverrideValues` treats a stored value as an override only when its runtime type matches the setting's declared type; anything else reads as `inherit`.

## Persistence

- Global: writes `config[key] = value` to `globalPath`.
- Provider: writes/deletes `config.providerOverrides[providerId][key]` via `readRawConfig` + `writeConfigFile`. Removes empty records.
- Model: calls `setModelSetting(currentModel, key, value)` from `model-data`; writes to `.freecode/models.json` `settings` (sparse). Setting a field to `undefined` removes it from the sparse object; the `{}` sentinel prevents re-seeding from the legacy `modelOverrides` field.

## Terminal Behavior

Requires a TTY (`runConfigBody` bails with a message otherwise). `list-menu` owns selection state: `selected === -1` is the tab row (only present with >1 tab), `selected >= 0` is a setting row indexing that tab's *contiguous visible* settings list. Up from row 0 goes to the tab row; Down from the tab row goes to row 0; Left/Right on the tab row switch tabs. `q`/`Q` or Esc closes — `q` is handled in `tab.onKey` and reaches it even on the tab row (the base falls through unowned keys there). Values and `effectiveValues` are recomputed live in `renderBody` each draw so cross-tab edits show. `onExitClear` resets the scroll region; the menu-shell finally restores stdin/cursor and the bottom UI.
