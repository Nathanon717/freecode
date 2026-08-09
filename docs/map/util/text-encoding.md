# src/util/text-encoding.ts - Text Encoding Helpers

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Shared BOM handling for any text file that may have been authored or edited outside this codebase (config, prompts, downloaded eval datasets, recorded e2e fixtures).

## Read When

You're about to `readFileSync` a file that a user, an external tool, or a download could have written with a leading UTF-8 BOM — a bare `JSON.parse` throws on one with no useful message.
<!-- END GENERATED MAP INTENT -->

**Key neighbors:** `src/config/index.ts`, `src/eval/custom.ts`, `src/eval/humaneval-data.ts`, `src/agent/system-prompt.ts`, `src/tokenizers/backends/bpe-json.ts`, `src/cli/eval/custom-eval-menu.ts`, `scripts/docgen/generate-docs.ts`, `tests/harness/run-e2e.ts`, `tests/repo-encoding.test.ts` (the repo-wide guard that uses `hasBom`).

**Update triggers:** New BOM-adjacent encoding helpers needed in two or more source files.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Removes a leading UTF-8 BOM (U+FEFF) if present. Never touches other characters.
 */
stripBom(text: string): string

/**
 * Reads a text file as UTF-8 with any leading BOM stripped. Use this instead of bare `readFileSync(path, 'utf-8')` for any file that may have been authored or edited outside this codebase (config, prompts, downloaded datasets, recorded e2e fixtures).
 */
readTextFile(path: string): string

/**
 * Reads and parses a JSON file as UTF-8 with any leading BOM stripped. `JSON.parse` throws on a raw leading BOM, which is the failure mode this exists to prevent.
 */
readJsonFile<T = unknown>(path: string): T

/**
 * Byte-level BOM check on raw file contents. Used by the repo-wide encoding guard (`tests/repo-encoding.test.ts`), which must inspect bytes on disk rather than a decoded string.
 */
hasBom(buf: Buffer<ArrayBufferLike>): boolean
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`eval/humaneval-data.ts`](../eval/humaneval-data.md) ×2, [`agent/system-prompt.ts`](../agent/system-prompt.md) ×1, [`cli/eval/custom-eval-menu.ts`](../cli/eval/custom-eval-menu.md) ×1, [`config/index.ts`](../config/index.md) ×1, [`eval/custom.ts`](../eval/custom.md) ×1, [`tokenizers/backends/bpe-json.ts`](../tokenizers/backends/bpe-json.md) ×1, [`tokenizers/backends/tekken.ts`](../tokenizers/backends/tekken.md) ×1

## Tests

`tests/util/text-encoding.test.ts`. 1 other test file references it.

## Budget

23 / 500 lines (477 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `stripBom`/`readTextFile`/`readJsonFile` operate on decoded strings (or read+decode a path) and only ever remove a *leading* BOM — they never touch control characters elsewhere in the text, which matters because e2e fixtures intentionally contain raw control bytes like DEL (`\x7f`) as real keystroke data.
- `hasBom` is a byte-level check on a raw `Buffer`, used by the repo-wide guard test rather than by runtime code (which reads files as decoded UTF-8 strings via `readTextFile`).
- Internal round-trip files that this app both writes and reads back itself (model cache, quota cache, eval result sink, etc.) are not routed through these helpers — nothing but this codebase ever produces them, so there's no real BOM risk to guard against.
