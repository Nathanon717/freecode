# src/cli/markdown-renderer.ts — Markdown Renderer

**Role:** Converts plain markdown text (from LLM responses) into chalk-styled terminal output. Active when `process.stdout.isTTY` is truthy **or** `FORCE_COLOR` is set — the eval subprocess runner sets `FORCE_COLOR=1` so eval output renders identically to interactive chat. Scripted runs without either flag receive raw text unchanged.

## What is rendered

- **Code fences** (`` ``` `` or ```` ```lang ````): content rendered black-on-green background; fence delimiter lines consumed. Language identifier shown as a heading line immediately before the block.
- **Horizontal rules** (a line of 3+ `-`, `*`, or `_`, optionally space-separated): rendered as a full-width white `─` line spanning `process.stdout.columns`.
- **Pipe-delimited tables** (a header row, a `| --- | :-: |` delimiter row, then body rows): rendered with box-drawing borders. Columns size to their widest visible cell, the header is bold, and `:` markers in the delimiter row set per-column left/right/center alignment. Cell contents pass through inline rendering. Limitations: the delimiter row must contain a `|` (so bare `---` stays a horizontal rule), and escaped `\|` or pipes inside inline code are not handled.
- `**bold**`: `chalk.bold`
- `*italic*`: `chalk.italic`
- Inline `` `code` `` spans: passed through untouched (no bold/italic applied inside).

## Exports

- `renderMarkdown(text)` — render a complete string; use for OpenAI and prompt-tools paths where the full text is available at once.
- `createMarkdownStreamRenderer()` — stateful line-buffered streaming renderer. Call `.push(chunk)` per incoming chunk (returns ready rendered lines), then `.flush()` at end of stream to emit any remaining partial line. Preserves live token-by-token output.

## Key neighbours

- Called from `agent/loop.ts` (streaming path uses `createMarkdownStreamRenderer`; OpenAI path uses `renderMarkdown`).
- Called from `agent/prompt-tools.ts` (uses `renderMarkdown`).

## Update triggers

- Adding new markdown constructs (headings, lists, horizontal rules, tables, etc.).
- Changing code block appearance.
- Changing the render gate condition (TTY or FORCE_COLOR).
