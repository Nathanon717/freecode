# src/util/line-numbers.ts - Line-Number Gutter

**Role:** Pure helper that prefixes lines with a right-aligned line-number gutter (`padStart` number + `": "`) so every colon aligns regardless of digit count. No rendering/color dependencies.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
withLineNumbers(startLine: number, lines: string[]): string[]
```
<!-- END GENERATED EXPORTS -->

## Key Facts

- Single source of the gutter format shared by the `read` tool (model-facing output in `agent/tools/read.ts`) and the create/edit previews in `cli/transcript-renderer.ts` (`formatCreatedFileContent`, and the gutter walk in `formatEditFileDiff`).
- Width is the digit count of the largest number in the block, so all three tools render one identical gutter.

## Read When

- Changing how line numbers are shown in read/create/edit output.
