# src/util/line-numbers.ts - Line-Number Gutter

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Pure helper that prefixes lines with a right-aligned line-number gutter (`padStart` number + `": "`) so every colon aligns regardless of digit count. No rendering/color dependencies.

## Read When

- Changing how line numbers are shown in read/create/edit output.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Render lines with a right-aligned line-number gutter so every colon lines up
 * regardless of digit count. Shared by the read tool (model-facing output) and
 * the create/edit transcript previews so all three show one gutter format.
 *
 * The gutter width is the digit count of the largest number rendered, so within
 * a block ` 9: `, `10: `, `100: ` all align on the colon.
 */
withLineNumbers(startLine: number, lines: string[]): string[]
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`agent/tools/read.ts`](../agent/tools/read.md) ×1, [`cli/render/transcript-format.ts`](../cli/render/transcript-format.md) ×1

## Tests

`tests/util/line-numbers.test.ts`. 1 other test file references it.

## Budget

13 / 500 lines (487 to spare).
<!-- END GENERATED MAP FACTS -->

## Key Facts

- Single source of the gutter format shared by the `read` tool (model-facing output in `agent/tools/read.ts`) and the create/edit previews in `cli/render/transcript-renderer.ts` (`formatCreatedFileContent`, and the gutter walk in `formatEditFileDiff`).
- Width is the digit count of the largest number in the block, so all three tools render one identical gutter.
