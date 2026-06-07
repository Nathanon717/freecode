import chalk from "chalk";

function renderInline(text: string): string {
  // Split on inline code spans first so we never apply formatting inside `code`.
  const parts = text.split(/(`[^`]*`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // inline code — leave untouched
      return part
        .replace(/\*\*([^*\n]+)\*\*/g, (_, c: string) => chalk.bold(c))
        .replace(/\*([^*\n]+)\*/g, (_, c: string) => chalk.italic(c));
    })
    .join("");
}

// Returns the rendered string for one complete line (without the trailing \n),
// or null to signal the line should be dropped from output (fence delimiters).
type LineProcessor = (line: string) => string | null;

function makeLineProcessor(): { process: LineProcessor; inCodeBlock: () => boolean } {
  let inCode = false;

  function process(line: string): string | null {
    if (!inCode) {
      const m = line.match(/^```(.*)$/);
      if (m) {
        inCode = true;
        const lang = m[1].trim();
        // Show language heading immediately; consume the fence line itself.
        return lang ? chalk.bgGreen.black(` ${lang} `) : null;
      }
      return renderInline(line);
    } else {
      if (line.trim() === "```") {
        inCode = false;
        return null; // closing fence consumed
      }
      return chalk.bgGreen.black(line);
    }
  }

  return { process, inCodeBlock: () => inCode };
}

/**
 * Render a complete markdown string.
 * No-ops when stdout is not a TTY so scripted/eval output stays raw.
 */
export function renderMarkdown(text: string): string {
  if (!process.stdout.isTTY) return text;

  const { process: processLine } = makeLineProcessor();
  const lines = text.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    const rendered = processLine(line);
    if (rendered !== null) out.push(rendered);
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
 * No-ops (pass-through) when stdout is not a TTY.
 */
export function createMarkdownStreamRenderer(): MarkdownStreamRenderer {
  if (!process.stdout.isTTY) {
    return {
      push: (chunk: string) => chunk,
      flush: () => "",
    };
  }

  const { process: processLine } = makeLineProcessor();
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
        // null = fence delimiter, consumed without emitting anything (including its \n)
      }
      return output;
    },

    flush(): string {
      if (!lineBuffer) return "";
      const rendered = processLine(lineBuffer);
      lineBuffer = "";
      return rendered ?? "";
    },
  };
}
