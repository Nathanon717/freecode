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
  isFavorite?: boolean;
  pricing?: { input: number | null; output: number | null; confidence: PricingConfidence };
}

getSelectableModels(): Promise<ModelMenuItem[]>
buildAllItemLines(items, selected, currentModel, groupMode?, canonicalGroups?)
filterModelItems(items, query)

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

- Type printable characters to filter by provider, display name, model ID, or `provider:model`; Backspace removes filter characters.
- Up/Down moves the selected row, wrapping at the ends.
- Left/Right (←/→) toggles the selected model as a favorite. Favorites are keyed by the full `provider:model` ID and persisted to `favoriteModels` in the global config. They appear in a dedicated **Favorites** section at the top of the list (showing the full `provider:model` ID in gold with ★), and again inside their provider/canonical-group section (showing the display name in gold with ★). Both copies are independently selectable — Up/Down moves linearly through all visible rows including both copies of each favorite.
- Enter applies the selected `provider:model`.
- Space applies the selected `provider:model` and writes it as `defaultModel` in the global config.
- Esc closes without changing the model.
- Ctrl+C exits the process.

The command owns raw stdin only while the picker is open, then restores the readline interface before returning.

## Sort Flow

Before the main picker opens, `runModelCommand` checks for new models (from `model-cache.ts` `isNew` flag) that have no entry in `canonical-models.json`. If any exist, a sort flow runs first: for each unsorted model the user is shown a list of existing canonical groups to assign it to, or can type a new group name to create one. Results are saved to `canonical-models.json` and the picker then uses the updated groups for its model-grouped view.

## Canonical Groups Integration

The model-grouped tab view (`Tab` key) uses `canonical-models.json` (via `providers/canonical-models.ts`) for section headers. A model assigned to a canonical group always gets its own named section regardless of how many providers offer it (single-provider canonical models escape "Other"). The section header is the canonical name; each row shows the provider name.
