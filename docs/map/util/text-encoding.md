# src/util/text-encoding.ts - Text Encoding Helpers

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Shared BOM handling for any text file that may have been authored or edited outside this codebase (config, prompts, downloaded eval datasets, recorded e2e fixtures).

## Read When

You're about to `readFileSync` a file that a user, an external tool, or a download could have written with a leading UTF-8 BOM — a bare `JSON.parse` throws on one with no useful message.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Removes a leading UTF-8 BOM (U+FEFF) if present. Never touches other characters
 * — e2e fixtures intentionally carry raw control bytes like DEL (`\x7f`) as real
 * keystroke data.
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

27 / 500 lines (473 to spare).
<!-- END GENERATED MAP FACTS -->

## Scope

Internal round-trip files this app both writes and reads back itself (model cache, quota cache, eval result sink) are deliberately not routed through these helpers — nothing but this codebase produces them, so there is no BOM risk to guard against.

A BOM-adjacent encoding helper earns a place here once two or more source files need it.

Consumers reach past `src/`: `scripts/docgen/generate-docs.ts`, `tests/harness/run-e2e.ts`
and `tests/repo-encoding.test.ts` (the repo-wide guard built on `hasBom`) all import from
here, so the generated Neighbors block understates the blast radius.
