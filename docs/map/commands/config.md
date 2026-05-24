# src/commands/config.ts - Interactive Config Editor

**Role:** Implements the `/config` terminal UI for editing boolean settings in the global config file.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `runConfigCommand` | `(rl: Interface) => Promise<void>` | Runs the raw-mode config editor, then restores readline/stdin state. |

## Settings

| Key | Label | Behavior |
|-----|-------|----------|
| `useOllama` | Use Ollama | Enables/disables local Ollama auto-detection. |
| `toolRationale` | Tool rationale | Controls whether tool schemas require a `rationale` field. |

## Persistence

- Reads effective settings from `loadConfig()`.
- Writes changes to `getConfigPaths().globalPath`.
- Uses `readRawConfig()` to preserve unrelated config keys.
- Uses `writeConfigFile()` so the config cache is invalidated.

## Terminal Behavior

Requires a TTY. It pauses readline, enables raw mode, hides the cursor, and handles arrow/space/enter keys. `q` or Esc closes the editor. On cleanup it erases its own rendered rows (computing wrapped row count against terminal width) and restores stdin and cursor state, so the prompt returns to a clean screen like the `/model` picker.
