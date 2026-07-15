# src/util/text-encoding.ts - Text Encoding Helpers

**Purpose:** Shared BOM handling for any text file that may have been authored or edited outside this codebase (config, prompts, downloaded eval datasets, recorded scenarios).

**Read when:** You're about to `readFileSync` a file that a user, an external tool, or a download could have written with a leading UTF-8 BOM — a bare `JSON.parse` throws on one with no useful message.

**Key neighbors:** `src/config/index.ts`, `src/eval/custom.ts`, `src/eval/humaneval-data.ts`, `src/agent/system-prompt.ts`, `src/tokenizers/backends/bpe-json.ts`, `src/cli/custom-eval-menu.ts`, `scripts/docgen/generate-docs.ts`, `tests/harness/run-scenarios.ts`, `tests/repo-encoding.test.ts` (the repo-wide guard that uses `hasBom`).

**Update triggers:** New BOM-adjacent encoding helpers needed in two or more source files.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
stripBom(text: string): string

readTextFile(path: string): string

readJsonFile<T = unknown>(path: string): T

hasBom(buf: Buffer<ArrayBufferLike>): boolean
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `stripBom`/`readTextFile`/`readJsonFile` operate on decoded strings (or read+decode a path) and only ever remove a *leading* BOM — they never touch control characters elsewhere in the text, which matters because scenario fixtures intentionally contain raw control bytes like DEL (`\x7f`) as real keystroke data.
- `hasBom` is a byte-level check on a raw `Buffer`, used by the repo-wide guard test rather than by runtime code (which reads files as decoded UTF-8 strings via `readTextFile`).
- Internal round-trip files that this app both writes and reads back itself (model cache, quota cache, eval result sink, etc.) are not routed through these helpers — nothing but this codebase ever produces them, so there's no real BOM risk to guard against.
