import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  renderMarkdown,
  createMarkdownStreamRenderer,
} from "../../src/cli/markdown-renderer.js";

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const stripCode = (s: string) =>
  stripAnsi(s)
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n");

// Force TTY so the renderer is active during tests.
let origIsTTY: boolean | undefined;
beforeEach(() => {
  origIsTTY = process.stdout.isTTY;
  Object.defineProperty(process.stdout, "isTTY", {
    value: true,
    configurable: true,
  });
});
afterEach(() => {
  Object.defineProperty(process.stdout, "isTTY", {
    value: origIsTTY,
    configurable: true,
  });
});

describe("renderMarkdown", () => {
  it("passes through plain text unchanged", () => {
    expect(stripAnsi(renderMarkdown("hello world"))).toBe("hello world");
  });

  it("renders **bold** stripping delimiters", () => {
    expect(stripAnsi(renderMarkdown("this is **bold** text"))).toBe(
      "this is bold text",
    );
  });

  it("renders *italic* stripping delimiters", () => {
    expect(stripAnsi(renderMarkdown("this is *italic* text"))).toBe(
      "this is italic text",
    );
  });

  it("does not apply inline formatting inside inline `code` spans", () => {
    const raw = "use `**not bold**` here";
    const out = renderMarkdown(raw);
    // Backticks are stripped visually; inner content is not bold/italic
    expect(stripAnsi(out)).toBe("use **not bold** here");
  });

  it("renders fenced code block with dark background, consuming fence lines", () => {
    const input = "before\n```\nx = 1\n```\nafter";
    const out = renderMarkdown(input);
    // Blank padding lines above and below, content indented by CODE_BLOCK_H_PAD spaces
    expect(stripCode(out)).toBe("before\n\n  x = 1\n\nafter");
    expect(out).toMatch(/x = 1/);
  });

  it("shows language heading for fenced block with language identifier", () => {
    const input = "```python\nx = 1\n```";
    const out = renderMarkdown(input);
    // Lang label on its own line above the block (grey bg text-only, bold), then blank+code+blank
    expect(stripCode(out)).toBe("python\n\n  x = 1\n\n");
  });

  it("does not apply bold/italic inside fenced code block", () => {
    const input = "```\n**not bold** and *not italic*\n```";
    const out = renderMarkdown(input);
    expect(stripCode(out)).toBe("\n  **not bold** and *not italic*\n\n");
  });

  it("renders a horizontal rule full-width in white", () => {
    const width = process.stdout.columns || 80;
    const out = renderMarkdown("---");
    expect(stripAnsi(out)).toBe("─".repeat(width));
  });

  it("treats ***, ___, and spaced rules as horizontal rules", () => {
    const width = process.stdout.columns || 80;
    for (const raw of ["***", "___", "- - -", "* * *"]) {
      expect(stripAnsi(renderMarkdown(raw))).toBe("─".repeat(width));
    }
  });

  it("does not treat bold/italic markers as a horizontal rule", () => {
    expect(stripAnsi(renderMarkdown("**bold**"))).toBe("bold");
  });

  it("handles unclosed code block gracefully", () => {
    const input = "```\nincomplete";
    const out = renderMarkdown(input);
    expect(stripCode(out)).toBe("\n  incomplete\n\n");
  });

  it("returns raw text unchanged when not a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: false,
      configurable: true,
    });
    const input = "**bold** and ```code```";
    expect(renderMarkdown(input)).toBe(input);
  });

  it("renders a pipe-delimited table with box-drawing borders", () => {
    const input = "| H1 | H2 |\n| --- | --- |\n| a | bb |";
    const out = stripCode(renderMarkdown(input));
    expect(out).toBe(
      [
        "┌────┬────┐",
        "│ H1 │ H2 │",
        "├────┼────┤",
        "│ a  │ bb │",
        "└────┴────┘",
      ].join("\n"),
    );
  });

  it("sizes columns to the widest cell and honours alignment markers", () => {
    const input = "| Name | Qty |\n| :--- | --: |\n| apple | 3 |";
    const out = stripCode(renderMarkdown(input));
    expect(out).toBe(
      [
        "┌───────┬─────┐",
        "│ Name  │ Qty │",
        "├───────┼─────┤",
        "│ apple │   3 │",
        "└───────┴─────┘",
      ].join("\n"),
    );
  });

  it("renders inline markup inside table cells without breaking width", () => {
    const input = "| Col |\n| --- |\n| **hi** |";
    const out = renderMarkdown(input);
    // **hi** -> visible "hi" (width 2), so the column sizes to the 3-wide header.
    // Bold delimiters are stripped and width is measured from the visible text,
    // so the box stays aligned.
    expect(stripCode(out)).toBe(
      ["┌─────┐", "│ Col │", "├─────┤", "│ hi  │", "└─────┘"].join("\n"),
    );
  });

  it("does not treat a paragraph followed by a horizontal rule as a table", () => {
    const width = process.stdout.columns || 80;
    const out = stripAnsi(renderMarkdown("foo | bar\n---\nbaz"));
    expect(out).toBe(`foo | bar\n${"─".repeat(width)}\nbaz`);
  });

  it("emits a lone pipe line as text when no delimiter row follows", () => {
    expect(stripAnsi(renderMarkdown("a | b\nplain"))).toBe("a | b\nplain");
  });

  it("renders a table followed by trailing prose", () => {
    const input = "| A | B |\n| --- | --- |\n| 1 | 2 |\n\ndone";
    const out = stripCode(renderMarkdown(input));
    expect(out).toBe(
      [
        "┌───┬───┐",
        "│ A │ B │",
        "├───┼───┤",
        "│ 1 │ 2 │",
        "└───┴───┘",
        "",
        "done",
      ].join("\n"),
    );
  });

  it("flushes a table at end of input with no trailing line", () => {
    const input = "| A |\n| --- |\n| 1 |";
    const out = stripCode(renderMarkdown(input));
    expect(out).toBe(["┌───┐", "│ A │", "├───┤", "│ 1 │", "└───┘"].join("\n"));
  });
});

describe("createMarkdownStreamRenderer", () => {
  it("assembles chunks into lines before rendering", () => {
    const r = createMarkdownStreamRenderer();
    expect(r.push("hel")).toBe(""); // partial line — nothing emitted yet
    const out = r.push("lo\n");
    expect(stripAnsi(out)).toBe("hello\n");
  });

  it("correctly renders bold across chunk boundary", () => {
    const r = createMarkdownStreamRenderer();
    r.push("say **bo");
    const out = r.push("ld** now\n");
    expect(stripAnsi(out)).toBe("say bold now\n");
  });

  it("does not apply formatting inside fenced code block", () => {
    const r = createMarkdownStreamRenderer();
    expect(r.push("```\n")).toBe(""); // opening fence: buffering begins
    expect(r.push("**raw**\n")).toBe(""); // content buffered, not emitted yet
    const block = r.push("```\n"); // closing fence flushes the whole block
    // Blank padding line above, indented content, blank padding line below, trailing \n
    expect(stripCode(block)).toBe("\n  **raw**\n\n");
  });

  it("shows language heading line for named block", () => {
    const r = createMarkdownStreamRenderer();
    expect(r.push("```typescript\n")).toBe(""); // opening fence buffered
    r.push("x = 1\n");
    const block = r.push("```\n"); // closing fence emits label + code
    expect(stripCode(block)).toContain("typescript");
    expect(stripCode(block)).toContain("x = 1");
  });

  it("flush returns partial final line", () => {
    const r = createMarkdownStreamRenderer();
    r.push("partial");
    expect(stripAnsi(r.flush())).toBe("partial");
    expect(r.flush()).toBe(""); // second flush is empty
  });

  it("buffers a streamed table and flushes it at end of stream", () => {
    const r = createMarkdownStreamRenderer();
    expect(r.push("| A | B |\n")).toBe(""); // tentative header buffered
    expect(r.push("| --- | --- |\n")).toBe(""); // delimiter confirms the table
    expect(r.push("| 1 | 2 |\n")).toBe(""); // body row buffered
    const out = stripCode(r.flush());
    expect(out).toBe(
      ["┌───┬───┐", "│ A │ B │", "├───┼───┤", "│ 1 │ 2 │", "└───┴───┘"].join(
        "\n",
      ),
    );
  });

  it("is a pass-through when not a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: false,
      configurable: true,
    });
    const r = createMarkdownStreamRenderer();
    expect(r.push("**bold**\n")).toBe("**bold**\n");
    expect(r.flush()).toBe("");
  });
});
