# src/providers/model-settings-registry.ts - Model Settings Registry

**Role:** Thin shared module holding the `getModelSettings` function pointer. Exists to break the circular-import risk between `model-store.ts` (which depends on `db.ts`) and `config/index.ts` (which calls `getModelSettings` inside `resolveModelSettings`). Neither file imports the other; `model-store.ts` registers into this module and `config/index.ts` reads from it.

## Exports

```typescript
registerModelSettings(fn: (key: string) => OverridableSettings): void
  // model-store.ts calls this at module-load time to wire up its implementation.

getModelSettings(key: string): OverridableSettings
  // config/index.ts calls this in resolveModelSettings(). Returns {} if nothing registered.
```

## Lifecycle

- `model-store.ts` calls `registerModelSettings(getModelSettings)` at module load time.
- In tests, `model-store.ts` is never loaded → registry returns `{}` → `resolveModelSettings` falls back to provider/global defaults.
- In the real app, `model-store.ts` is loaded before `resolveModelSettings` is ever called, so the registry is populated in time.

## Read When

- Tracing the circular-import avoidance pattern between `model-store.ts` and `config/index.ts`.
- Debugging per-model settings not applying in `resolveModelSettings`.

## Key Neighbors

- [providers/model-store.md](model-store.md): registers its `getModelSettings` implementation here.
- [config/index.md](../config/index.md): reads `getModelSettings` from here in `resolveModelSettings`.
- [providers/db-config-cache.md](db-config-cache.md): same registry pattern used for DB config sync.

## Update Triggers

Update this page when the registry pattern is extended or the `OverridableSettings` signature changes.
