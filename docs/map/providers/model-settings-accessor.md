# src/providers/model-settings-accessor.ts - Model Settings Accessor

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Thin shared module holding the `getModelSettings` function pointer. Exists to break the circular-import risk between `model-data.ts` (which depends on `db.ts`) and `config/index.ts` (which calls `getModelSettings` inside `resolveModelSettings`). Neither file imports the other; `model-data.ts` registers into this module and `config/index.ts` reads from it.

## Read When

- Tracing the circular-import avoidance pattern between `model-data.ts` and `config/index.ts`.
- Debugging per-model settings not applying in `resolveModelSettings`.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
registerModelSettings(fn: GetModelSettingsFn): void

getModelSettings(key: string): OverridableSettings
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/types.ts`](types.md) ×2
- **Imported by:** [`config/index.ts`](../config/index.md) ×1, [`providers/model-data.ts`](model-data.md) ×1

## Tests

`tests/providers/model-settings-accessor.test.ts`.

## Budget

13 / 500 lines (487 to spare).
<!-- END GENERATED MAP FACTS -->

## Lifecycle

- `model-data.ts` calls `registerModelSettings(getModelSettings)` at module load time.
- In tests, `model-data.ts` is never loaded → accessor returns `{}` → `resolveModelSettings` falls back to provider/global defaults.
- In the real app, `model-data.ts` is loaded before `resolveModelSettings` is ever called, so the accessor is populated in time.

## Key Neighbors

- [providers/model-data.md](model-data.md): registers its `getModelSettings` implementation here.
- [config/index.md](../config/index.md): reads `getModelSettings` from here in `resolveModelSettings`.
- [providers/db-config-cache.md](../store/db-config-cache.md): same registry pattern used for DB config sync.

## Update Triggers

Update this page when the accessor pattern is extended or the `OverridableSettings` signature changes.
