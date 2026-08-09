# src/util/guards.ts - Type Guard Utilities

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Shared type guard utilities used across multiple modules.

## Read When

You need to narrow `unknown` to a plain object (`Record<string, unknown>`).
<!-- END GENERATED MAP INTENT -->

**Key neighbors:** `src/providers/adapters/openai-compat.ts`

**Update triggers:** New type guards that are (or will be) used in two or more source files.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
isRecord(value: unknown): value is Record<string, unknown>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`providers/adapters/openai-compat-sse.ts`](../providers/adapters/openai-compat-sse.md) ×11, [`util/errors.ts`](errors.md) ×5, [`providers/adapters/openai-compat.ts`](../providers/adapters/openai-compat.md) ×4, [`providers/adapters/adapter-http-retry.ts`](../providers/adapters/adapter-http-retry.md) ×2, [`store/call-log.ts`](../store/call-log.md) ×1

## Tests

`tests/util/guards.test.ts`.

## Budget

3 / 500 lines (497 to spare).
<!-- END GENERATED MAP FACTS -->
