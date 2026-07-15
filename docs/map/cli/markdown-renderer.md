# src/cli/markdown-renderer.ts - Markdown Renderer

**Role:** Converts plain markdown text (from LLM responses) into chalk-styled terminal output. Active when `process.stdout.isTTY` is truthy **or** `FORCE_COLOR` is set — the eval subprocess runner sets `FORCE_COLOR=1` so eval output renders identically to interactive chat. Scripted runs without either flag receive raw text unchanged.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
renderMarkdown(text: string): string

interface MarkdownStreamRenderer {
  /** Feed a raw chunk; returns any complete rendered lines ready to write. */
  push(chunk: string): string;
  /** Flush any buffered partial line at end of stream. */
  flush(): string;
}

createMarkdownStreamRenderer(): MarkdownStreamRenderer
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `renderMarkdown(text)` — renders a complete string; use for OpenAI and parsed-tools paths where the full text is available at once.
- `createMarkdownStreamRenderer()` — stateful line-buffered streaming renderer; call `.push(chunk)` per incoming chunk (returns ready rendered lines), then `.flush()` at end of stream to emit any remaining partial line. Preserves live token-by-token output.

## What is rendered

- **Code fences** (`` ``` `` or ```` ```lang ````): content rendered black-on-green background; fence delimiter lines consumed. Language identifier shown as a heading line immediately before the block.
- **Horizontal rules** (a line of 3+ `-`, `*`, or `_`, optionally space-separated): rendered as a full-width white `─` line spanning `process.stdout.columns`.
- **Pipe-delimited tables** (a header row, a `| --- | :-: |` delimiter row, then body rows): rendered with box-drawing borders. Columns size to their widest visible cell, the header is bold, and `:` markers in the delimiter row set per-column left/right/center alignment. Cell contents pass through inline rendering. Limitations: the delimiter row must contain a `|` (so bare `---` stays a horizontal rule), and escaped `\|` or pipes inside inline code are not handled.
- `**bold**`: `chalk.bold`
- `*italic*`: `chalk.italic`
- Inline `` `code` `` spans: grey background, passed through untouched (no bold/italic applied inside).

## Prose wrapping (background-bleed fix)

Prose lines go through `renderProse` (= `renderInline` + `wrapStyled`), not `renderInline` directly. `wrapStyled` wraps to `termWidth()` (`process.stdout.columns || 80`) and **hard-breaks a physical line only when a style is open at the wrap column** — it closes the open styles (`\x1b[0m`), emits a real newline, and reopens them on the next line. Without this, a grey inline-code background that the terminal soft-wraps bleeds across the rest of the wrapped row (terminal background-color-erase). Unstyled prose has no style open at the boundary, so it is left for the terminal to soft-wrap (preserving resize reflow). Tables and code blocks are width-sized separately and are **not** routed through `wrapStyled`; code-block lines share the same latent bleed if a line exceeds the terminal width (currently out of scope).

## Key neighbours

- Called from `agent/loop.ts` (streaming path uses `createMarkdownStreamRenderer`; OpenAI path uses `renderMarkdown`).
- Called from `agent/parsed-tools.ts` (uses `renderMarkdown`).

## Update triggers

- Adding new markdown constructs (headings, lists, horizontal rules, tables, etc.).
- Changing code block appearance.
- Changing the render gate condition (TTY or FORCE_COLOR).
