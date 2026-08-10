# src/util/keyboard.ts - Raw-Key Helpers

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Shared raw-terminal-key detection used by the interactive input handlers.

## Read When

You're handling a raw keypress (`data`/`key` string from stdin in raw mode) and need to recognize backspace, which terminals send as either DEL (`\x7f`) or BS (`\x08`) depending on platform/emulator.
<!-- END GENERATED MAP INTENT -->

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

4 / 500 lines (496 to spare).
<!-- END GENERATED MAP FACTS -->

## Notes

A raw-key classification earns a place here once two or more source files need it.
