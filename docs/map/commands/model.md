# src/commands/model.ts - Interactive Model Picker

**Role:** Implements the interactive `/model` picker used by TTY sessions.

## Exports

```typescript
interface ModelMenuItem {
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
  modelsSource?: 'static' | 'live';
  isNew?: boolean;
  pricing?: { input: number | null; output: number | null; confidence: PricingConfidence };
}

getSelectableModels(): Promise<ModelMenuItem[]>
buildAllItemLines(items, selected, currentModel, removedByProvider)

runModelCommand(
  rl: Interface,
  currentModel: string,
  setSelectedModel: (model: string) => void
): Promise<void>
```

## Model Discovery

`getSelectableModels()`:

1. Calls `initDynamicProviders()` so live provider model lists are current.
2. Adds every model from configured registry providers with an API key.
3. Attaches `pricing` to Anthropic and OpenAI models via `getAnthropicVerifiedRates` / `getOpenAIVerifiedRates` (both fetched in parallel). Agreed prices render green, single-source prices render yellow, and source disagreements render as red `sources disagree`.

The selected model string is always `providerId:modelId`.

## TTY Picker

`runModelCommand()` requires an interactive terminal. It draws a temporary raw-mode screen grouped by provider:

- Up/Down moves the selected row, wrapping at the ends.
- Enter applies the selected `provider:model`.
- Space applies the selected `provider:model` and writes it as `defaultModel` in the global config.
- Esc closes without changing the model.
- Ctrl+C exits the process.

The command owns raw stdin only while the picker is open, then restores the readline interface before returning.
