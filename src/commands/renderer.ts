import chalk from "chalk";
import {
  renderTurn,
  type TranscriptRuntimeOptions,
} from "../cli/transcript-renderer.js";
import { renderMarkdown } from "../cli/markdown-renderer.js";

// Route everything to stdout so dividers, rationale, tool lines, and response
// text all appear in the same stream — giving a coherent visual demo.
const DEMO_OPTS: TranscriptRuntimeOptions = {
  stream: "stdout",
  maxResultLines: 30,
};

export function runRendererDemo(): void {
  process.stdout.write(
    chalk.bold(
      "\nRenderer Demo — output is routed through the live transcript renderer\n",
    ),
  );
  process.stdout.write(
    chalk.dim(
      "Changing any renderer function will automatically change what you see here.\n",
    ),
  );

  // ── Turn 1: read ──────────────────────────────────────────────────────
  // read bakes a right-aligned line-number gutter into its result (see
  // agent/tools/read.ts). The multi-digit slice shows the colons staying aligned
  // — the same gutter create and edit render below.
  renderTurn([{
    text: renderMarkdown(
      "Starting from the entrypoint to see how a session is wired up.\n",
    ),
    tools: [{
      name: 'read',
      displayArgs: { path: 'src/index.ts', offset: 8 },
      result: {
        kind: 'text',
        result: [
          " 8: #!/usr/bin/env node",
          " 9: import { runSession } from './cli/session-runner.js';",
          "10: import { loadConfig } from './config/index.js';",
          "11: ",
          "12: const config = loadConfig();",
          "13: await runSession(config);",
        ].join("\n"),
      },
    }],
  }], DEMO_OPTS);

  // ── Turn 2: list_dir ───────────────────────────────────────────────────────
  // Path "." is filtered out — args display as `list_dir()` with no arguments.
  renderTurn([{
    tools: [{
      name: 'list_dir',
      displayArgs: { path: '.' },
      rationale: 'Listing the repo root to get my bearings.',
      result: {
        kind: 'text',
        result: ["src/", "docs/", "tests/", "package.json", "tsconfig.json"].join("\n"),
      },
    }],
  }], DEMO_OPTS);

  // ── Turn 3: grep ───────────────────────────────────────────────────────────
  // Rationale + grep with file:line:content match results.
  renderTurn([{
    tools: [{
      name: 'grep',
      displayArgs: { pattern: 'writeTranscriptToolLeadIn', path: 'src/' },
      rationale: 'Looking for every callsite of writeTranscriptToolLeadIn to understand usage patterns.',
      result: {
        kind: 'text',
        result: [
          "src/agent/tools/index.ts:84:  writeTranscriptToolLeadIn(); // normalised blank-line separator",
          "src/cli/transcript-renderer.ts:264:export function writeTranscriptToolLeadIn(",
          "src/commands/renderer.ts:32:  writeTranscriptToolLeadIn(DEMO_OPTS);",
        ].join("\n"),
      },
    }],
  }], DEMO_OPTS);

  // ── Turn 4: shell_exec ─────────────────────────────────────────────────────
  // shell_exec args are not filtered — command string is shown in the call line.
  renderTurn([{
    tools: [{
      name: 'shell_exec',
      displayArgs: { command: 'npm.cmd run build 2>&1 | tail -5' },
      rationale: 'Confirming the tree still compiles before I change anything.',
      result: {
        kind: 'text',
        result: [
          "> freecode@0.1.0 build",
          "> tsc --project tsconfig.json",
          "",
          "Build complete.",
        ].join("\n"),
      },
    }],
  }], DEMO_OPTS);

  // ── Turn 5: create ─────────────────────────────────────────────────────
  // Only path is shown in args (content filtered out). Preview shows the
  // written content, not the "Wrote N lines" result string.
  const writeContent = [
    "import chalk from 'chalk';",
    "import { beginTranscriptTurn } from '../cli/transcript-renderer.js';",
    "",
    "export function runRendererDemo(): void {",
    "  beginTranscriptTurn();",
    "  // ...",
    "}",
  ].join("\n");
  renderTurn([{
    tools: [{
      name: 'create',
      displayArgs: { path: 'src/commands/renderer.ts' },
      rationale: 'Scaffolding the demo command itself.',
      result: { kind: 'create-content', content: writeContent },
    }],
  }], DEMO_OPTS);

  // ── Turn 6: edit ──────────────────────────────────────────────────────
  // Only path shown in args. Result is a colored diff: red for removed lines,
  // green for added lines, magenta for matching/equal lines in context, dim
  // for surrounding context.
  renderTurn([{
    tools: [{
      name: 'edit',
      displayArgs: { path: 'src/cli/slash-commands.ts' },
      rationale: 'Registering /renderer alongside the existing slash commands.',
      result: {
        kind: 'edit-diff',
        path: 'src/cli/slash-commands.ts',
        oldText: "  { command: '/keys',   description: 'Show API key status' },",
        newText: "  { command: '/keys',     description: 'Show API key status' },\n  { command: '/renderer', description: 'Show renderer demo' },",
        contextBefore: ["  { command: '/help', description: 'Show this help' },"],
        contextAfter: ["  { command: '/renderer', description: 'Show renderer demo' },"],
        lineIndent: '',
        startLine: 8,
      },
    }],
  }], DEMO_OPTS);

  // ── Turn 7: response + tool call ───────────────────────────────────────────
  // Blank line is inserted between response text and tool call by the state machine.
  renderTurn([{
    text: renderMarkdown(
      "Let me check the existing slash command list before adding the new entry.\n",
    ),
    tools: [{
      name: 'read',
      displayArgs: { path: 'src/cli/slash-commands.ts' },
      result: {
        kind: 'text',
        result: [
          "export const SLASH_COMMANDS: SlashCommandInfo[] = [",
          "  { command: '/clear',  description: 'Clear screen and chat history' },",
          "  { command: '/config', description: 'Open interactive config' },",
          "  { command: '/help',   description: 'Show this help' },",
          "  // ...",
          "];",
        ].join("\n"),
      },
    }],
  }], DEMO_OPTS);

  // ── Turn 8: multiple tool calls in one step ─────────────────────────────────
  renderTurn([{
    text: renderMarkdown("I'll read both renderer files in parallel.\n"),
    tools: [
      {
        name: 'read',
        displayArgs: { path: 'src/cli/transcript-renderer.ts' },
        result: {
          kind: 'text',
          result: "export function formatToolCallLine(name, args): string {\n  return chalk.cyan(`${displayName(name)}(${formatArgs(...)})`); \n}",
        },
      },
      {
        name: 'read',
        displayArgs: { path: 'src/cli/markdown-renderer.ts' },
        result: {
          kind: 'text',
          result: "export function renderMarkdown(text: string): string {\n  if (!process.stdout.isTTY) return text;\n  // ...\n}",
        },
      },
    ],
  }], DEMO_OPTS);

  // ── Turn 9: tool error ──────────────────────────────────────────────────────
  renderTurn([{
    text: renderMarkdown(
      "Now a path that isn't there, so the failure shows up as a tool error.\n",
    ),
    tools: [{
      name: 'read',
      displayArgs: { path: 'src/missing.ts' },
      result: {
        kind: 'error',
        error: new Error("ENOENT: no such file or directory, open 'src/missing.ts'"),
      },
    }],
  }], DEMO_OPTS);

  // ── Turn 10: markdown showcase ───────────────────────────────────────────────
  // Shows everything an agent might try, including unsupported elements that
  // fall through as plain text.
  const markdownDemo = [
    "Here is every markdown construct a response might contain — anything the",
    "renderer does not support falls through as plain text.",
    "",
    "# Heading 1",
    "## Heading 2",
    "###### Heading 6",
    "",
    "**bold** and *italic* and _italic_ and ***bold italic*** and `code`",
    "~~strikethrough~~ and ~~**bold struck**~~ and *~~italic struck~~*",
    "",
    "**Run `npm test` before committing — `src/` changes are blockers.**",
    "**leading bold, `code(arg)`, then trailing bold text**",
    "*italic wrapping `inline code` and back to italic*",
    "**bold with *nested italic* and `code` together**",
    "`code` at line start, **`code` as the whole bold span**, `code` at end.",
    "",
    "Bare link: https://example.com/docs",
    "Labeled link: [the docs](https://example.com/docs)",
    "Link with markup in the label: [**bold** and `code`](https://example.com)",
    "**A bold span containing [a link](https://example.com) and `code`.**",
    "",
    "Escapes: \\*not italic\\* and \\`not code\\` and \\_\\_not bold\\_\\_",
    "Literal markdown inside code: `**not bold**` and `` `nested backticks` ``",
    "",
    "- unordered list item",
    "- item with **bold**, `code`, and [link](https://example.com)",
    "  - nested item",
    "1. ordered item",
    "2. second item",
    "",
    "> blockquote line",
    "> **bold quote with `code`**",
    "",
    "| Column A | `code header` | **bold header** |",
    "| :------- | :-----------: | --------------: |",
    "| left     |    center     |           right |",
    "| `cell()` | **bold cell** |    *italic* row |",
    "| ~~gone~~ |               | [link](https://example.com) |",
    "",
    "| Not a table — no delimiter row follows |",
    "",
    "---",
    "",
    "***",
    "",
    "```typescript",
    "function renderMarkdown(text: string): string {",
    "  const lines = text.split('\\n');",
    "  return lines.map(processLine).join('\\n');",
    "}",
    "```",
    "",
    "```",
    "plain code block with no language label",
    "**markdown inside a fence stays literal**",
    "```",
    "",
    "```json",
    '{ "wide": "a code block whose longest line sets the background width" }',
    "```",
    "",
    "A long paragraph that soft-wraps: **a bold run with `inline code` inside it that is deliberately long enough to straddle the terminal wrap column so the grey background break is visible.**",
    "",
    "<div>raw HTML is not interpreted</div>",
    "",
    "Unclosed fence below:",
    "```sh",
    "echo 'flushed at end of stream'",
  ].join("\n");
  renderTurn([{
    text: renderMarkdown(markdownDemo) + "\n",
  }], DEMO_OPTS);
}
