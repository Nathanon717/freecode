# src/commands/renderer.ts - Renderer Demo Command

**Role:** Implements `/renderer` — a hardcoded example transcript that exercises every turn layout type through the live transcript and markdown renderers. Because it calls the real renderer functions, any change to those renderers is immediately reflected in the demo output.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `runRendererDemo` | `() => void` | Renders the full demo transcript to stdout. |

## Implementation

Each demo turn is expressed as a `renderTurn([...], DEMO_OPTS)` call from `cli/transcript-renderer.ts`.
Private helpers (`writeTool`, `writeToolWithRationale`, `writeResponse`, `transcriptOut`) have been removed;
all orchestration now goes through the shared `renderTurn` / `renderToolStep` / `writeToolCallHeader` /
`writeToolStepResult` API.

## Turn types demonstrated

| Section | ToolStep kind |
|---------|---------------|
| Tool call only (`read`, `list_dir`, `shell_exec`) | `text` |
| Rationale + tool call (`grep`) | `text` with `rationale` set |
| Prompt-tool call | `text` with `promptTools: true` |
| `create` (content preview) | `create-content` |
| `edit` (colored diff) | `edit-diff` |
| Response + tool call | `RenderedStep.text` + tool |
| Multiple tool calls in one step | multiple `ToolStep` entries in one `RenderedStep` |
| Tool error | `error` |
| Markdown showcase | `RenderedStep.text` only, no tools |

## Key neighbors

- `../cli/transcript-renderer.ts` — `renderTurn`, `renderToolStep`, `writeToolCallHeader`, `writeToolStepResult`, and the state machine
- `../cli/markdown-renderer.ts` — `renderMarkdown`
- `../cli/command-dispatcher.ts` — dispatches `/renderer`

## Update triggers

Update this page when turn types are added/removed, the demo structure changes, or key neighbors are renamed.
