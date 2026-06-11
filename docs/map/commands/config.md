# src/commands/config.ts - Interactive Config Editor

**Role:** Implements the `/config` terminal UI for editing settings at global, provider, and model levels.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `runConfigCommand` | `(rl: Interface, currentModel?: string) => Promise<void>` | Runs the raw-mode config editor, then restores readline/stdin state. |

## Tabs

Three tabs, navigated by pressing Up from the first setting row to reach the tab row, then Left/Right to switch:

| Tab | Scope | Stored in |
|-----|-------|-----------|
| Global | All providers/models | `config.json` top-level keys |
| Provider | Current provider | `config.json` `providerOverrides[providerId]` |
| Model | Current `provider:model` | `.freecode/models.json` `settings` (sparse) via `model-store` |

Provider and Model tabs are only available when `currentModel` contains a colon. If no model is selected, only Global is shown.

## Settings

| Key | Label | Behavior |
|-----|-------|----------|
| `toolRationale` | Tool rationale | Ask model to explain each tool call before executing. |
| `showProviderUsage` | Provider usage | Print token/rate-limit usage after each turn. |
| `parallelTools` | Parallel tools | Allow model to call multiple tools in the same response. |

## Override values

Global tab cycles: `true ↔ false`.  
Provider/Model tabs cycle: `inherit → true → false → inherit` (Right) or `inherit → false → true → inherit` (Left). `inherit` means the key is absent from the override record, so the parent level's value applies.

## Persistence

- Global: writes `config[key] = value` to `globalPath`.
- Provider: writes/deletes `config.providerOverrides[providerId][key]` via `readRawConfig` + `writeConfigFile`. Removes empty records.
- Model: calls `setModelSetting(currentModel, key, value)` from `model-store`; writes to `.freecode/models.json` `settings` (sparse). Setting a field to `undefined` removes it from the sparse object; the `{}` sentinel prevents re-seeding from the legacy `modelOverrides` field.

## Terminal Behavior

Requires a TTY. Pauses readline, enables raw mode, hides cursor. `sel === -1` is the tab row; `sel >= 0` is a setting row. Up from row 0 goes to tab row; Down from tab row goes to row 0. `q` or Esc closes. Cleanup erases rendered rows and restores stdin/cursor.
