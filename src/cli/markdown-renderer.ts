import chalk from "chalk";

// Horizontal padding (spaces) added to the left and right of each code block line.
// Increase this number to add more breathing room inside the grey border.
const CODE_BLOCK_H_PAD = 2;

// A markdown horizontal rule: a line of 3+ `-`, `*`, or `_`, optionally
// separated by spaces (e.g. `---`, `***`, `_ _ _`).
const HR_RE = /^ {0,3}([-*_])(?: *\1){2,} *$/;

function renderHorizontalRule(): string {
  const width = process.stdout.columns || 80;
  return chalk.white("─".repeat(width));
}

function renderInline(text: string): string {
  // Split on bold inline code, then plain inline code, so formatting is never
  // applied inside backtick spans. Bold inline code (**`x`**) must be matched
  // first so the inner backtick span isn't consumed by the plain-code branch.
  const parts = text.split(/(\*\*`[^`]*`\*\*|`[^`]*`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) {
        if (part.startsWith("**")) {
          // Bold inline code: **`code`** — strip ** and backtick from each side.
          const inner = part.slice(3, -3);
          return chalk.bold(chalk.bgHex("#333333").white(inner));
        }
        // Plain inline code: strip surrounding backticks.
        const inner = part.slice(1, -1);
        return chalk.bgHex("#333333").white(inner);
      }
      return part
        .replace(/\*\*([^*\n]+)\*\*/g, (_, c: string) => chalk.bold(c))
        .replace(/\*([^*\n]+)\*/g, (_, c: string) => chalk.italic(c));
    })
    .join("");
}

// Visible width of a rendered cell: strip SGR escape codes, then measure length.
// `renderInline` already removes `**`/`*`/backtick markers, so what remains after
// stripping ANSI is the on-screen text. Wide CJK glyphs are not accounted for —
// that is the house style throughout the repo (plain `.length`).
const SGR_RE = /\x1b\[[0-9;]*m/g;
function visibleWidth(s: string): number {
  return s.replace(SGR_RE, "").length;
}

type Align = "left" | "right" | "center";

// Split a table row into trimmed cells, dropping the empty cells produced by
// optional leading/trailing pipes. Escaped pipes (`\|`) and pipes inside inline
// code are not handled — pipe-delimited tables only (see map page).
function parseTableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

// A delimiter row separates the header from the body, e.g. `| --- | :-: |`.
// We require an actual `|` so a bare `---`/`***` still reaches HR_RE as a rule.
function isDelimiterRow(line: string): boolean {
  if (!line.includes("|")) return false;
  const cells = parseTableCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function parseAligns(delimLine: string): Align[] {
  return parseTableCells(delimLine).map((c) => {
    const left = c.startsWith(":");
    const right = c.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
}

// A candidate table row: contains a pipe and is not blank. Whether it is really
// a table depends on the following line being a delimiter row.
function isTableRow(line: string): boolean {
  return line.includes("|") && line.trim().length > 0;
}

function padCell(cell: string, width: number, align: Align): string {
  const space = Math.max(0, width - visibleWidth(cell));
  if (align === "right") return " ".repeat(space) + cell;
  if (align === "center") {
    const l = Math.floor(space / 2);
    return " ".repeat(l) + cell + " ".repeat(space - l);
  }
  return cell + " ".repeat(space);
}

// Render a buffered table. `lines` is [header, delimiter, ...body].
function renderTable(lines: string[]): string {
  const aligns = parseAligns(lines[1]);
  const header = parseTableCells(lines[0]);
  const body = lines.slice(2).map(parseTableCells);
  const nCols = Math.max(
    header.length,
    aligns.length,
    ...body.map((r) => r.length),
  );

  const alignFor = (i: number): Align => aligns[i] ?? "left";
  const cell = (rows: string[], i: number): string => rows[i] ?? "";

  // Render every cell's inline markup, then size each column to its widest cell.
  const renderedHeader = Array.from({ length: nCols }, (_, i) =>
    chalk.bold(renderInline(cell(header, i))),
  );
  const renderedBody = body.map((row) =>
    Array.from({ length: nCols }, (_, i) => renderInline(cell(row, i))),
  );
  const widths = Array.from({ length: nCols }, (_, i) =>
    Math.max(
      visibleWidth(renderedHeader[i]),
      ...renderedBody.map((row) => visibleWidth(row[i])),
      1,
    ),
  );

  const border = (l: string, mid: string, r: string): string =>
    chalk.white(l + widths.map((w) => "─".repeat(w + 2)).join(mid) + r);
  const bar = chalk.white("│");
  const rowLine = (cells: string[]): string =>
    bar +
    cells
      .map((c, i) => " " + padCell(c, widths[i], alignFor(i)) + " ")
      .join(bar) +
    bar;

  const out: string[] = [];
  out.push(border("┌", "┬", "┐"));
  out.push(rowLine(renderedHeader));
  out.push(border("├", "┼", "┤"));
  for (const row of renderedBody) out.push(rowLine(row));
  out.push(border("└", "┴", "┘"));
  return out.join("\n");
}

function renderCodeBlock(lang: string | null, lines: string[]): string {
  const hPad = " ".repeat(CODE_BLOCK_H_PAD);
  const maxLen = Math.max(
    lang ? lang.length : 0,
    ...lines.map((l) => l.length + CODE_BLOCK_H_PAD * 2),
  );
  const blankLine = chalk.bgHex("#333333")(" ".repeat(maxLen));
  const out: string[] = [];
  // Lang label above the block: grey bg only behind the text, not padded to full width
  if (lang) out.push(chalk.hex("#333333").bold(lang));
  // Blank line at top of code area
  out.push(blankLine);
  for (const line of lines) {
    out.push(chalk.bgHex("#333333").white((hPad + line).padEnd(maxLen)));
  }
  // Blank line below
  out.push(blankLine);
  return out.join("\n");
}

// Returns the rendered string for one complete line (without trailing \n),
// or null to signal the line should be dropped, or a multi-line string when
// a code block is flushed.
type LineProcessor = (line: string) => string | null;

function makeLineProcessor(): {
  process: LineProcessor;
  flush: () => string | null;
} {
  let inCode = false;
  let codeLang: string | null = null;
  let codeLines: string[] = [];

  // Table buffering. `tableLines` holds the candidate rows; while a single
  // tentative header is buffered (`tableConfirmed` false) we are waiting on the
  // next line to confirm it via a delimiter row. Once confirmed we keep
  // buffering body rows until a non-row line ends the table.
  let tableLines: string[] = [];
  let tableConfirmed = false;

  function flushCode(): string | null {
    if (!inCode && codeLines.length === 0 && codeLang === null) return null;
    const rendered = renderCodeBlock(codeLang, codeLines);
    codeLang = null;
    codeLines = [];
    return rendered || null;
  }

  function flushTable(): string {
    const rendered = renderTable(tableLines);
    tableLines = [];
    tableConfirmed = false;
    return rendered;
  }

  // Join two possibly-null processor results into a single return value.
  function joinResults(a: string | null, b: string | null): string | null {
    if (a === null) return b;
    if (b === null) return a;
    return a + "\n" + b;
  }

  function process(line: string): string | null {
    if (inCode) {
      if (line.trim() === "```") {
        inCode = false;
        return flushCode();
      }
      codeLines.push(line);
      return null; // buffer
    }

    if (tableLines.length > 0) {
      if (!tableConfirmed) {
        // Awaiting the delimiter row that turns the tentative header into a table.
        if (isDelimiterRow(line)) {
          tableConfirmed = true;
          tableLines.push(line);
          return null;
        }
        // Not a table after all — emit the buffered header, then process this line.
        const header = renderInline(tableLines[0]);
        tableLines = [];
        return joinResults(header, process(line));
      }
      if (isTableRow(line)) {
        tableLines.push(line);
        return null;
      }
      // A non-row line ends the table; flush it and then handle this line.
      return joinResults(flushTable(), process(line));
    }

    const m = line.match(/^```(.*)$/);
    if (m) {
      inCode = true;
      codeLang = m[1].trim() || null;
      return null; // buffer until closing fence
    }
    if (/^#{1,6}\s/.test(line)) return null;
    if (HR_RE.test(line)) return renderHorizontalRule();
    if (isTableRow(line)) {
      // Tentatively buffer as a table header; the next line decides.
      tableLines = [line];
      tableConfirmed = false;
      return null;
    }
    return renderInline(line);
  }

  function flush(): string | null {
    if (inCode) {
      inCode = false;
      return flushCode();
    }
    if (tableLines.length > 0) {
      // Confirmed table flushes as a table; a lone tentative header is just text.
      if (tableConfirmed) return flushTable();
      const header = renderInline(tableLines[0]);
      tableLines = [];
      return header;
    }
    return null;
  }

  return { process, flush };
}

// True when output should be styled: real TTY, or FORCE_COLOR (used by the
// eval subprocess runner so evals render identically to interactive chat).
function shouldRenderMarkdown(): boolean {
  return process.stdout.isTTY || Boolean(process.env["FORCE_COLOR"]);
}

/**
 * Render a complete markdown string.
 * No-ops when output is not a styled terminal (no TTY and no FORCE_COLOR).
 */
export function renderMarkdown(text: string): string {
  if (!shouldRenderMarkdown()) return text;

  const { process: processLine, flush } = makeLineProcessor();
  const lines = text.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    const rendered = processLine(line);
    if (rendered !== null) out.push(rendered);
  }

  const tail = flush();
  if (tail !== null) out.push(tail);

  // When a code block is last, its final line is the blank background padding.
  // Add an empty string so out.join("\n") produces the trailing blank line.
  // Tables end with a border character (└) and don't need this.
  if (out.length > 0) {
    const last = out[out.length - 1].replace(SGR_RE, "");
    if (last.includes("\n") && last.split("\n").pop()!.trim() === "") out.push("");
  }

  return out.join("\n");
}

export interface MarkdownStreamRenderer {
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
export function createMarkdownStreamRenderer(): MarkdownStreamRenderer {
  if (!shouldRenderMarkdown()) {
    return {
      push: (chunk: string) => chunk,
      flush: () => "",
    };
  }

  const { process: processLine, flush: flushLP } = makeLineProcessor();
  let lineBuffer = "";

  return {
    push(chunk: string): string {
      lineBuffer += chunk;
      const parts = lineBuffer.split("\n");
      lineBuffer = parts.pop()!; // last element: partial line (or "" if chunk ended with \n)

      let output = "";
      for (const line of parts) {
        const rendered = processLine(line);
        if (rendered !== null) output += rendered + "\n";
      }
      return output;
    },

    flush(): string {
      let output = "";
      if (lineBuffer) {
        const rendered = processLine(lineBuffer);
        lineBuffer = "";
        if (rendered !== null) output += rendered;
      }
      const tail = flushLP();
      if (tail !== null) output += (output ? "\n" : "") + tail;
      return output;
    },
  };
}
