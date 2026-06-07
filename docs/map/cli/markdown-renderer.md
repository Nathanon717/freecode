# src/cli/markdown-renderer.ts — Markdown Renderer

**Role:** Converts plain markdown text (from LLM responses) into chalk-styled terminal output. Only active when `process.stdout.isTTY` is truthy — scripted/eval runs receive raw text unchanged.

## What is rendered

- **Code fences** (`` ``` `` or ```` ```lang ````): content rendered black-on-green background; fence delimiter lines consumed. Language identifier shown as a heading line immediately before the block.
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

- Adding new markdown constructs (headings, lists, horizontal rules, etc.).
- Changing code block appearance.
- Changing the TTY gate condition.
