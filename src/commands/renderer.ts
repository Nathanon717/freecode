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

function sectionLabel(label: string): void {
  process.stdout.write(chalk.yellow(`\n  ↓ ${label}\n`));
}

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
  // Result shown as dimmed indented lines.
  sectionLabel('read → result preview shown as dimmed lines');
  renderTurn([{
    tools: [{
      name: 'read',
      displayArgs: { path: 'src/index.ts' },
      result: {
        kind: 'text',
        result: [
          "#!/usr/bin/env node",
          "import { runSession } from './cli/session-runner.js';",
          "import { loadConfig } from './config/index.js';",
          "",
          "const config = loadConfig();",
          "await runSession(config);",
        ].join("\n"),
      },
    }],
  }], DEMO_OPTS);

  // ── Turn 2: list_dir ───────────────────────────────────────────────────────
  // Path "." is filtered out — args display as `list_dir()` with no arguments.
  sectionLabel(
    'list_dir → "." path filtered out, shows list_dir() with no args',
  );
  renderTurn([{
    tools: [{
      name: 'list_dir',
      displayArgs: { path: '.' },
      result: {
        kind: 'text',
        result: ["src/", "docs/", "tests/", "package.json", "tsconfig.json"].join("\n"),
      },
    }],
  }], DEMO_OPTS);

  // ── Turn 3: grep ───────────────────────────────────────────────────────────
  // Rationale + grep with file:line:content match results.
  sectionLabel("grep → rationale + call, match lines in dimmed preview");
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
  sectionLabel("shell_exec → full args shown, stdout/stderr in dimmed preview");
  renderTurn([{
    tools: [{
      name: 'shell_exec',
      displayArgs: { command: 'npm.cmd run build 2>&1 | tail -5' },
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
  sectionLabel(
    'create → only path in args, content as preview',
  );
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
      result: { kind: 'create-content', content: writeContent },
    }],
  }], DEMO_OPTS);

  // ── Turn 6: edit ──────────────────────────────────────────────────────
  // Only path shown in args. Result is a colored diff: red for removed lines,
  // green for added lines, magenta for matching/equal lines in context, dim
  // for surrounding context.
  sectionLabel(
    'edit → colored diff (red/green/magenta)',
  );
  renderTurn([{
    tools: [{
      name: 'edit',
      displayArgs: { path: 'src/cli/slash-commands.ts' },
      result: {
        kind: 'edit-diff',
        path: 'src/cli/slash-commands.ts',
        oldText: "  { command: '/keys',   description: 'Show API key status' },",
        newText: "  { command: '/keys',     description: 'Show API key status' },\n  { command: '/renderer', description: 'Show renderer demo' },",
        contextBefore: ["  { command: '/help', description: 'Show this help' },"],
        contextAfter: ["  { command: '/renderer', description: 'Show renderer demo' },"],
        lineIndent: '',
      },
    }],
  }], DEMO_OPTS);

  // ── Turn 7: response + tool call ───────────────────────────────────────────
  // Blank line is inserted between response text and tool call by the state machine.
  sectionLabel("response + tool call (blank line inserted between them)");
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
  sectionLabel("multiple tool calls in one step (blank line between each)");
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
  sectionLabel("tool error");
  renderTurn([{
    text: renderMarkdown("Let me try to read a file that does not exist.\n"),
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
  sectionLabel(
    "markdown response — all formatting types (supported and unsupported)",
  );
  const markdownDemo = [
    "# Heading 1  ← unsupported, rendered as-is",
    "## Heading 2  ← unsupported",
    "### Heading 3  ← unsupported",
    "",
    "",
    "| Column A | Column B |",
    "| -------- | -------- |",
    "| cell 1   | cell 2   |",
    "",
    "---",
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
    "```",
    "",
    "**bold** and *italic* and ***Bold italic*** and `code`",
  ].join("\n");
  renderTurn([{
    text: renderMarkdown(markdownDemo) + "\n",
  }], DEMO_OPTS);
}
