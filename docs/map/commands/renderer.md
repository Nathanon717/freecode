# src/commands/renderer.ts - Renderer Demo Command

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Implements `/renderer` — a hardcoded example transcript that exercises every turn layout type through the live transcript and markdown renderers. Because it calls the real renderer functions, any change to those renderers is immediately reflected in the demo output.

## Read When

- Changing `/renderer` demo output after modifying transcript or markdown renderers.
- Adding a new turn layout or tool result kind to the demo transcript.
- Debugging rendered turn output by comparing against this hardcoded example transcript.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
runRendererDemo(): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/render/transcript-renderer.ts`](../cli/render/transcript-renderer.md) ×11, [`cli/render/markdown-renderer.ts`](../cli/render/markdown-renderer.md) ×5

## Tests

`tests/commands/renderer.test.ts`. 1 other test file references it.

## Budget

283 / 500 lines (217 to spare).
<!-- END GENERATED MAP FACTS -->

## Implementation

Each demo turn is expressed as a `renderTurn([...], DEMO_OPTS)` call from `cli/render/transcript-renderer.ts`.
Private helpers (`writeTool`, `writeToolWithRationale`, `writeResponse`, `transcriptOut`) have been removed;
all orchestration now goes through the shared `renderTurn` / `renderToolStep` / `writeToolCallHeader` /
`writeToolStepResult` API.

## Turn types demonstrated

| Section | ToolStep kind |
|---------|---------------|
| Tool call only (`read`, `list_dir`, `shell_exec`) | `text` |
| Rationale + tool call (`grep`) | `text` with `rationale` set |
| Parsed-tool call | `text` with `parsedTools: true` |
| `create` (content preview) | `create-content` |
| `edit` (colored diff) | `edit-diff` |
| Response + tool call | `RenderedStep.text` + tool |
| Multiple tool calls in one step | multiple `ToolStep` entries in one `RenderedStep` |
| Tool error | `error` |
| Markdown showcase | `RenderedStep.text` only, no tools |
