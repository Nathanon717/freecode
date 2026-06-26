# src/util/guards.ts - Type Guard Utilities

**Purpose:** Shared type guard utilities used across multiple modules.

**Read when:** You need to narrow `unknown` to a plain object (`Record<string, unknown>`).

**Key neighbors:** `src/providers/adapters/openai-compat.ts`

**Update triggers:** New type guards that are (or will be) used in two or more source files.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
isRecord(value: unknown): value is Record<string, unknown>
```
<!-- END GENERATED EXPORTS -->
