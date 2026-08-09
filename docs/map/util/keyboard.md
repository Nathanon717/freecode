# src/util/keyboard.ts - Raw-Key Helpers

**Purpose:** Shared raw-terminal-key detection used by the interactive input handlers.

**Read when:** You're handling a raw keypress (`data`/`key` string from stdin in raw mode) and need to recognize backspace, which terminals send as either DEL (`\x7f`) or BS (`\x08`) depending on platform/emulator.

**Key neighbors:** `src/cli/session-modes.ts`, `src/cli/tools/tool-approval.ts`, `src/commands/model.ts`.

**Update triggers:** New raw-key classification needed in two or more source files.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Terminals send either DEL (0x7f) or BS (0x08) for the backspace key depending on platform/emulator.
 */
isBackspaceKey(key: string): boolean
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/session-modes.ts`](../cli/session-modes.md) ×1, [`commands/model.ts`](../commands/model.md) ×1

## Tests

`tests/util/keyboard.test.ts`.

## Budget

3 / 500 lines (497 to spare).
<!-- END GENERATED MAP FACTS -->
