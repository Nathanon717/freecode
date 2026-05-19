# src/providers/model-sources.ts - Model Data Sources

**Role:** Static catalog of official, gateway, aggregator, observability, and reference sources for model pricing/context/capability data.

## Exports

```typescript
MODEL_DATA_SOURCES: ModelDataSource[]
getAllModelDataSources(): ModelDataSource[]
getModelDataSourcesByKind(kind: ModelDataSourceKind): ModelDataSource[]
```

## Read When

- Adding or removing model metadata sources.
- Changing `/sources` display content.
- Planning future model price/context gatherers.

## Key Neighbors

- [registry.md](registry.md): current provider/model catalog used for routing.
- [../../cli/command-dispatcher.md](../cli/command-dispatcher.md): renders `/sources`.
- [providers.md](../../providers.md): generated provider reference.

## Update Triggers

Update this page when the source catalog purpose, exported helpers, or `/sources` ownership changes.
