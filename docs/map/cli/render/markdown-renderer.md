# src/cli/render/markdown-renderer.ts - Markdown Renderer

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Converts plain markdown text (from LLM responses) into chalk-styled terminal output. Active when `process.stdout.isTTY` is truthy **or** `FORCE_COLOR` is set — the eval subprocess runner sets `FORCE_COLOR=1` so eval output renders identically to interactive chat. Scripted runs without either flag receive raw text unchanged.

## Read When

- Changing how inline markdown tokens (strong, em, links, codespans) get styled in terminal output.
- Debugging grey background bleed when styled prose soft-wraps at the terminal width boundary.
- Extending pipe-table rendering, code block framing, or the streaming line-buffered renderer.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Render a complete markdown string.
 * No-ops when output is not a styled terminal (no TTY and no FORCE_COLOR).
 */
renderMarkdown(text: string): string

interface MarkdownStreamRenderer {
  /** Feed a raw chunk; returns any complete rendered lines ready to write. */
  push(chunk: string): string;
  /** Flush any buffered partial line at end of stream. */
  flush(): string;
}

/**
 * Line-buffered streaming markdown renderer.
 * Emits rendered lines as each `\n` arrives, preserving the live-streaming effect.
 * Code blocks are buffered until their closing fence so the background width
 * can be sized to the longest line.
 * No-ops (pass-through) when output is not a styled terminal.
 */
createMarkdownStreamRenderer(): MarkdownStreamRenderer
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/theme.ts`](../theme.md) ×4
- **Imported by:** [`commands/renderer.ts`](../../commands/renderer.md) ×5, [`agent/loop.ts`](../../agent/loop.md) ×2, [`agent/parsed-tools.ts`](../../agent/parsed-tools.md) ×2

## Tests

`tests/cli/render/markdown-renderer.test.ts`.

## Budget

489 / 500 lines (11 to spare).

## Env

`FORCE_COLOR`
<!-- END GENERATED MAP FACTS -->

## What is rendered

- **ATX headings** (`# ` … `###### `): rendered **bold**, with the `#` markers and any closing run of `#` (`## Foo ##`) stripped. All six levels look identical — the terminal has one weight to spend, so heading level is not conveyed. The text goes through inline rendering first, so `## keep \`isRecord\` **exported**` keeps its code span. The `\s` in `/^#{1,6}\s/` is load-bearing: `#hashtag` and `####### seven` fall through to prose and render verbatim. A heading's following blank line survives, which is the blank on row 2 of the `tests/e2e/agent-markdown-render.e2e.json` block. Since bold is open across the whole line, an over-width heading is always hard-broken by `wrapStyled` rather than left to the terminal to soft-wrap — the same trade any styled prose line already makes (see below). Headings *inside* a fence are never touched — the `inCode` branch of `process` precedes the heading check. Until 2026-07-30 a heading line was dropped entirely, taking its words with it; the e2e scenario pins the current behaviour, so changing it again is a decision rather than an accident.
- **Code fences** (`` ``` `` or ```` ```lang ````): content rendered white on the `theme.codeSurface` grey (see [../theme.md](../theme.md)); fence delimiter lines consumed. Language identifier shown as a heading line immediately before the block, tinted in that same grey as a foreground.
- **Horizontal rules** (a line of 3+ `-`, `*`, or `_`, optionally space-separated): rendered as a full-width white `─` line spanning `process.stdout.columns`.
- **Pipe-delimited tables** (a header row, a `| --- | :-: |` delimiter row, then body rows): rendered with box-drawing borders. Columns size to their widest visible cell, the header is bold, and `:` markers in the delimiter row set per-column left/right/center alignment. Cell contents pass through inline rendering. Limitations: the delimiter row must contain a `|` (so bare `---` stays a horizontal rule), and escaped `\|` or pipes inside inline code are not handled.
### Inline markup

Inline constructs are parsed by **`marked`'s inline lexer** (`new Lexer().inlineTokens(line)`), not by hand-rolled regexes. `renderToken` walks the token tree and maps each type to chalk, recursing into `tokens` so nesting composes:

| Token | Rendering |
| --- | --- |
| `strong` (`**x**`) | `chalk.bold` |
| `em` (`*x*` or `_x_`) | `chalk.italic` |
| `del` (`~~x~~`) | `chalk.strikethrough` |
| `codespan` (`` `x` ``) | `theme.codeSurfaceText` — grey background; **leaf**, contents are never styled |
| `link` | text underlined; href appended dim, unless it equals the text (bare autolink) |
| `escape` (`\*`) | the unescaped character |
| anything else | `raw` verbatim — notably `html`, which is deliberately not interpreted |

Because the lexer does the parsing, GFM rules apply for free: intraword underscores (`snake_case`) are not emphasis, unclosed `**` stays literal text, and `&`/`<`/`>` are **not** HTML-escaped (the inline lexer does not escape entities — only marked's HTML *parser* would).

Calling the lexer per-line is safe: the line processor resolves block structure (fences, tables) first and hands `renderInline` whole lines, and inline constructs never span lines here.

## Prose wrapping (background-bleed fix)

Prose lines go through `renderProse` (= `renderInline` + `wrapStyled`), not `renderInline` directly. `wrapStyled` wraps to `termWidth()` (`process.stdout.columns || 80`) and **hard-breaks a physical line only when a style is open at the wrap column** — it closes the open styles (`\x1b[0m`), emits a real newline, and reopens them on the next line. Without this, a grey inline-code background that the terminal soft-wraps bleeds across the rest of the wrapped row (terminal background-color-erase). Unstyled prose has no style open at the boundary, so it is left for the terminal to soft-wrap (preserving resize reflow). Tables and code blocks are width-sized separately and are **not** routed through `wrapStyled`; code-block lines share the same latent bleed if a line exceeds the terminal width (currently out of scope).
