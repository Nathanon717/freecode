# src/util/guards.ts

**Purpose:** Shared type guard utilities used across multiple modules.

**Read when:** You need to narrow `unknown` to a plain object (`Record<string, unknown>`).

**Exports:**
- `isRecord(value)` — returns `true` when `value` is a non-null, non-array object.

**Key neighbors:** `src/providers/adapters/openai-compat.ts`

**Update triggers:** New type guards that are (or will be) used in two or more source files.
