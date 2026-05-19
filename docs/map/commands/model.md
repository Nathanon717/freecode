# src/commands/model.ts - Interactive Model Picker

**Role:** Implements the interactive `/model` picker used by TTY sessions.

## Exports

```typescript
interface ModelMenuItem {
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
}

getSelectableModels(): Promise<ModelMenuItem[]>

runModelCommand(
  rl: Interface,
  currentModel: string,
  setSelectedModel: (model: string) => void
): Promise<void>
```

## Model Discovery

`getSelectableModels()`:

1. Calls `testAllProviders()` to filter providers to those with available keys/config.
2. Adds every model from each healthy registry provider.
3. Adds detected Ollama models when the Ollama status is healthy.

The selected model string is always `providerId:modelId`.

## TTY Picker

`runModelCommand()` requires an interactive terminal. It draws a temporary raw-mode screen grouped by provider:

- Up/Down moves the selected row, wrapping at the ends.
- Enter applies the selected `provider:model`.
- Space applies the selected `provider:model` and writes it as `preferredModel` in the global config.
- Esc closes without changing the model.
- Ctrl+C exits the process.

The command owns raw stdin only while the picker is open, then restores the readline interface before returning.
