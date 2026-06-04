# src/providers/model-traits.ts - Model Traits Store

**Role:** Persists discovered per-model capability facts to `~/.config/freecode/model-traits.json`. Currently tracks only one trait: `noNativeTools` — models where native function calling was rejected at runtime.

## Exports

```typescript
markModelNoNativeTools(providerId: string, modelId: string): void
isModelNoNativeTools(providerId: string, modelId: string): boolean
getNoNativeToolsModels(): Set<string>   // returns Set of "provider:modelId" strings
```

## Read When

- Understanding how prompt-tools fallback decisions are persisted.
- Adding a new per-model trait.

## Key Neighbors

- [agent/loop.md](../agent/loop.md): calls `markModelNoNativeTools` on first discovery and `isModelNoNativeTools` on every turn to skip native tools for known models.
- [commands/model.md](../commands/model.md): calls `getNoNativeToolsModels` to show a `~tools` badge on affected models in the picker.

## Update Triggers

Update this page when traits are added, renamed, or the storage path changes.
