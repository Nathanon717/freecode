# src/eval/result-sink.ts - Eval Result JSON IPC Sink

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Manages reads and writes to the `FREECODE_RESULT_JSON` file used for IPC between the eval subprocess and its parent. Preserves the placeholder→partial→final write semantics required by `custom-eval-menu.ts` polling.

## Read When

- Changing the `FREECODE_RESULT_JSON` file format or write timing.
- Debugging footer model/quota display during eval runs.
- Understanding the IPC boundary between the agent loop and the eval runner.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Write an initial placeholder entry to the FREECODE_RESULT_JSON file so the
 * footer shows the correct model immediately rather than waiting for the full
 * agent loop to complete.
 */
writeResultPlaceholder(path: string, model: string): void

/**
 * Returns an `onPartialResult` callback that updates the last entry in the
 * FREECODE_RESULT_JSON file with quota info as soon as the first API response
 * arrives.
 */
makePartialResultUpdater(path: string): (partial: Record<string, unknown>) => void

/**
 * Replace the placeholder entry in the FREECODE_RESULT_JSON file with the
 * full result (tokens, quota, model) after the agent loop completes.
 */
writeFinalResult(path: string, result: FinalResultEntry): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`logger.ts`](../logger.md) ×3
- **Imported by:** [`cli/command-dispatcher.ts`](../cli/command-dispatcher.md) ×3

## Tests

`tests/eval/result-sink.test.ts`.

## Budget

78 / 500 lines (422 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `writeResultPlaceholder`: Appends an initial placeholder entry (tokens=0, provider/model info) so the footer reflects the correct model immediately.
- `makePartialResultUpdater`: Returns an `onPartialResult` callback; merges quota info into the last entry as soon as the first API response arrives.
- `writeFinalResult`: Replaces the placeholder with the full result (tokens, quota, model) after the agent loop completes.

## IPC Contract (INV-4)

The file at `FREECODE_RESULT_JSON` is a JSON array of entries. The write sequence is:

1. **Placeholder** (appended before the agent loop): `{ providerId, modelId, totalTokens: 0 }`
2. **Partial update** (in `onPartialResult`): merges quota into the last entry whenever a non-null quota arrives.
3. **Final write** (after loop): replaces the last entry with full token counts, model ids, and quota.
