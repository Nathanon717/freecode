# src/commands/renderer.ts - Renderer Demo Command

**Role:** Implements `/renderer` — a hardcoded example transcript that exercises every turn layout type through the live transcript and markdown renderers. Because it calls the real renderer functions, any change to those renderers is immediately reflected in the demo output.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `runRendererDemo` | `() => void` | Renders the full demo transcript to stdout. |

## Turn types demonstrated

| Section | Renderer path exercised |
|---------|------------------------|
| Tool call only | `beginTranscriptTurn` → `writeTranscriptToolLeadIn` → `formatToolCallLine` → `formatToolResultPreview` |
| Rationale + tool call | Same as above, plus `chalk.cyan(rationale)` written to transcript stream (no `notifyTranscriptChunk`) |
| Response only | `writeResponse` → `notifyTranscriptChunk` → `renderMarkdown` |
| Response + tool call | Response path then tool path; state machine inserts blank line between them |
| Multiple tool calls in one step | `writeTranscriptToolLeadIn` called twice; state machine inserts blank between parallel calls |
| Multi-step turn | `endTranscriptStep(true)` produces the shared close+open divider |
| Tool error | `formatToolErrorLine` |
| Markdown showcase | `renderMarkdown` with every formatting type (supported and unsupported) |

## Key neighbors

- `../cli/transcript-renderer.ts` — state machine and formatting functions
- `../cli/markdown-renderer.ts` — `renderMarkdown`
- `../cli/command-dispatcher.ts` — dispatches `/renderer`

## Update triggers

Update this page when turn types are added/removed, the demo structure changes, or key neighbors are renamed.
