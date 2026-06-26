# src/commands/config.ts - Interactive Config Editor

**Role:** Implements the `/config` terminal UI for editing settings at global, provider, and model levels.

Built on the shared menu layers: `cli/menu-shell.ts` owns the bottom-UI teardown/restore lifecycle, and `cli/list-menu.ts` owns the pinned blank-line chrome, tab bar, and nav loop when multiple tabs are available. Each config tab is a `MenuTab` whose `onKey` cycles the focused setting's value (no `actionMenu`/`renderDetail`). `wrap: false` matches the editor's non-wrapping navigation.

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
| Model | Current `provider:model` | `.freecode/models.json` `settings` (sparse) via `model-store` |

Provider and Model tabs are only available when `currentModel` contains a colon. If no model is selected, only Global is shown and no tab chrome is drawn.

## Settings

| Key | Label | Tabs | Behavior |
|-----|-------|------|----------|
| `toolRationale` | Tool rationale | Global, Provider, Model | Ask model to explain each tool call before executing. |
| `showProviderUsage` | Provider usage | Global, Provider, Model | Print token/rate-limit usage after each turn. |
| `parallelTools` | Parallel tools | Global, Provider, Model | Allow model to call multiple tools in the same response. |
| `retryMaxWaitSeconds` | Max retry wait | Global only | Max seconds to wait before retrying a rate-limited request. |
| `diffContextLines` | Diff context | Global only | Lines of surrounding context shown above/below each edit diff. |
| `showEvalDots` | Eval dots | Global only | Show per-scenario eval result circles in the model picker. |
| `loadAgentsMd` | Load AGENTS.md | Provider, Model | Inject AGENTS.md from the working directory into the system prompt. Hidden from Global tab to preserve layout. |
| `parsedTools` | Parsed tools | Model only | Use text-based `<tool_call>` protocol instead of native function calling. Hidden from Global and Provider tabs (`modelTabOnly`). When auto-detected (provider rejected native tools, `isNativeToolsDisabled` returns true), the toggle is rendered as **true (auto-detected)** and cycling is blocked — it cannot be turned off. |

`globalOnly` settings are hidden in Provider and Model tabs. `modelOnly` settings are hidden in the Global tab. `modelTabOnly` settings are hidden from Global and Provider tabs (visible only on the Model tab).

## Override values

Global tab cycles: `true ↔ false`.  
Provider/Model tabs cycle: `inherit → true → false → inherit` (Right) or `inherit → false → true → inherit` (Left). `inherit` means the key is absent from the override record, so the parent level's value applies.

## Persistence

- Global: writes `config[key] = value` to `globalPath`.
- Provider: writes/deletes `config.providerOverrides[providerId][key]` via `readRawConfig` + `writeConfigFile`. Removes empty records.
- Model: calls `setModelSetting(currentModel, key, value)` from `model-store`; writes to `.freecode/models.json` `settings` (sparse). Setting a field to `undefined` removes it from the sparse object; the `{}` sentinel prevents re-seeding from the legacy `modelOverrides` field.

## Terminal Behavior

Requires a TTY (`runConfigBody` bails with a message otherwise). `list-menu` owns selection state: `selected === -1` is the tab row (only present with >1 tab), `selected >= 0` is a setting row indexing that tab's *contiguous visible* settings list. Up from row 0 goes to the tab row; Down from the tab row goes to row 0; Left/Right on the tab row switch tabs. `q`/`Q` or Esc closes — `q` is handled in `tab.onKey` and reaches it even on the tab row (the base falls through unowned keys there). Values and `effectiveValues` are recomputed live in `renderBody` each draw so cross-tab edits show. `onExitClear` resets the scroll region; the menu-shell finally restores stdin/cursor and the bottom UI.
