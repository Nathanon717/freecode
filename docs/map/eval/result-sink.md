# src/eval/result-sink.ts - Eval Result JSON IPC Sink

**Role:** Manages reads and writes to the `FREECODE_RESULT_JSON` file used for IPC between the eval subprocess and its parent. Preserves the placeholder→partial→final write semantics required by `scenario-menu.ts` polling.

## Exports

| Symbol | Description |
|--------|-------------|
| `writeResultPlaceholder(path, model)` | Appends an initial placeholder entry (tokens=0, provider/model info) so the footer reflects the correct model immediately. |
| `makePartialResultUpdater(path)` | Returns an `onPartialResult` callback that updates the last entry with quota info as soon as the first API response arrives. |
| `writeFinalResult(path, result)` | Replaces the placeholder entry with the full result (tokens, quota, model) after the agent loop completes. |

## IPC Contract (INV-4)

The file at `FREECODE_RESULT_JSON` is a JSON array of entries. The write sequence is:

1. **Placeholder** (appended before the agent loop): `{ providerId, modelId, totalTokens: 0 }`
2. **Partial update** (in `onPartialResult`): merges quota into the last entry whenever a non-null quota arrives.
3. **Final write** (after loop): replaces the last entry with full token counts, model ids, and quota.

## Read When

- Changing the `FREECODE_RESULT_JSON` file format or write timing.
- Debugging footer model/quota display during eval runs.
- Understanding the IPC boundary between the agent loop and the eval runner.
