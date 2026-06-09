import chalk from "chalk";
import {
  beginTranscriptTurn,
  endTranscriptStep,
  formatEditFileDiff,
  formatRationaleLine,
  formatToolCallLine,
  formatToolErrorLine,
  formatToolResultPreview,
  getTranscriptStream,
  notifyTranscriptChunk,
  writeTranscriptToolLeadIn,
  type TranscriptRuntimeOptions,
} from "../cli/transcript-renderer.js";
import { renderMarkdown } from "../cli/markdown-renderer.js";

// Route everything to stdout so dividers, rationale, tool lines, and response
// text all appear in the same stream — giving a coherent visual demo.
const DEMO_OPTS: TranscriptRuntimeOptions = {
  stream: "stdout",
  maxResultLines: 30,
};

function transcriptOut(): NodeJS.WritableStream {
  return getTranscriptStream(DEMO_OPTS);
}

// Write response text (goes to stdout; must be tracked so the state machine
// knows to insert a blank line before any subsequent tool call).
function writeResponse(text: string): void {
  process.stdout.write(text);
  notifyTranscriptChunk(text);
}

// Emit a tool call with its result preview.
function writeTool(
  name: string,
  args: Record<string, unknown>,
  result: string,
): void {
  writeTranscriptToolLeadIn(DEMO_OPTS);
  transcriptOut().write(formatToolCallLine(name, args) + "\n");
  const preview = formatToolResultPreview(result, DEMO_OPTS);
  if (preview) transcriptOut().write(preview + "\n");
}

// Emit a rationale line followed immediately by a tool call.
// Rationale goes to the transcript stream (same as tool lines), NOT through
// notifyTranscriptChunk — so there is no blank line between the rationale and
// the call, matching the real agent's "Rationale + tool call" layout.
function writeToolWithRationale(
  rationale: string,
  name: string,
  args: Record<string, unknown>,
  result: string,
): void {
  writeTranscriptToolLeadIn(DEMO_OPTS);
  transcriptOut().write(formatRationaleLine(rationale) + "\n");
  transcriptOut().write(formatToolCallLine(name, args) + "\n");
  const preview = formatToolResultPreview(result, DEMO_OPTS);
  if (preview) transcriptOut().write(preview + "\n");
}

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

  // ── Turn 1: read_file ──────────────────────────────────────────────────────
  // Display name aliased to "read". Result shown as dimmed indented lines.
  sectionLabel('read_file → display name "read", dimmed result preview');
  beginTranscriptTurn(DEMO_OPTS);
  writeTool(
    "read_file",
    { path: "src/index.ts" },
    [
      "#!/usr/bin/env node",
      "import { runSession } from './cli/session-runner.js';",
      "import { loadConfig } from './config/index.js';",
      "",
      "const config = loadConfig();",
      "await runSession(config);",
    ].join("\n"),
  );
  endTranscriptStep(false, DEMO_OPTS);

  // ── Turn 2: list_dir ───────────────────────────────────────────────────────
  // Path "." is filtered out — args display as `list_dir()` with no arguments.
  sectionLabel(
    'list_dir → "." path filtered out, shows list_dir() with no args',
  );
  beginTranscriptTurn(DEMO_OPTS);
  writeTool(
    "list_dir",
    { path: "." },
    ["src/", "docs/", "tests/", "package.json", "tsconfig.json"].join("\n"),
  );
  endTranscriptStep(false, DEMO_OPTS);

  // ── Turn 3: grep ───────────────────────────────────────────────────────────
  // Rationale + grep with file:line:content match results.
  sectionLabel("grep → rationale + call, match lines in dimmed preview");
  beginTranscriptTurn(DEMO_OPTS);
  writeToolWithRationale(
    "Looking for every callsite of writeTranscriptToolLeadIn to understand usage patterns.",
    "grep",
    { pattern: "writeTranscriptToolLeadIn", path: "src/" },
    [
      "src/agent/tools/index.ts:84:  writeTranscriptToolLeadIn(); // normalised blank-line separator",
      "src/cli/transcript-renderer.ts:264:export function writeTranscriptToolLeadIn(",
      "src/commands/renderer.ts:32:  writeTranscriptToolLeadIn(DEMO_OPTS);",
    ].join("\n"),
  );
  endTranscriptStep(false, DEMO_OPTS);

  // ── Turn 4: shell_exec ─────────────────────────────────────────────────────
  // shell_exec args are not filtered — command string is shown in the call line.
  sectionLabel("shell_exec → full args shown, stdout/stderr in dimmed preview");
  beginTranscriptTurn(DEMO_OPTS);
  writeTool(
    "shell_exec",
    { command: "npm.cmd run build 2>&1 | tail -5" },
    [
      "> freecode@0.1.0 build",
      "> tsc --project tsconfig.json",
      "",
      "Build complete.",
    ].join("\n"),
  );
  endTranscriptStep(false, DEMO_OPTS);

  // ── Turn 5: write_file ─────────────────────────────────────────────────────
  // Display name aliased to "create". Only path is shown in args (content
  // filtered out). Preview shows the written content, not the "Wrote N lines"
  // result string.
  sectionLabel(
    'write_file → display name "create", only path in args, content as preview',
  );
  beginTranscriptTurn(DEMO_OPTS);
  writeTranscriptToolLeadIn(DEMO_OPTS);
  transcriptOut().write(
    formatToolCallLine("write_file", { path: "src/commands/renderer.ts" }) +
      "\n",
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
  const writePreview = formatToolResultPreview(writeContent, DEMO_OPTS);
  if (writePreview) transcriptOut().write(writePreview + "\n");
  endTranscriptStep(false, DEMO_OPTS);

  // ── Turn 6: edit_file ──────────────────────────────────────────────────────
  // Display name aliased to "edit". Only path shown in args. Result is a
  // colored diff: red for removed lines, green for added lines, magenta for
  // matching/equal lines in context, dim for surrounding context.
  sectionLabel(
    'edit_file → display name "edit", colored diff (red/green/magenta)',
  );
  beginTranscriptTurn(DEMO_OPTS);
  writeTranscriptToolLeadIn(DEMO_OPTS);
  transcriptOut().write(
    formatToolCallLine("edit_file", { path: "src/cli/slash-commands.ts" }) +
      "\n",
  );
  const diff = formatEditFileDiff(
    "src/cli/slash-commands.ts",
    "  { command: '/keys',   description: 'Show API key status' },\n  { command: '/resume', description: 'Resume last session' },",
    "  { command: '/keys',     description: 'Show API key status' },\n  { command: '/renderer', description: 'Show renderer demo' },\n  { command: '/resume',   description: 'Resume last session' },",
    ["  { command: '/help', description: 'Show this help' },"],
    ["  { command: '/resume', description: 'Resume last session' },"],
    DEMO_OPTS,
  );
  if (diff) transcriptOut().write(diff + "\n");
  endTranscriptStep(false, DEMO_OPTS);

  // ── Turn 7: response + tool call ───────────────────────────────────────────
  // Blank line is inserted between response text and tool call by the state machine.
  sectionLabel("response + tool call (blank line inserted between them)");
  beginTranscriptTurn(DEMO_OPTS);
  writeResponse(
    renderMarkdown(
      "Let me check the existing slash command list before adding the new entry.\n",
    ),
  );
  writeTool(
    "read_file",
    { path: "src/cli/slash-commands.ts" },
    [
      "export const SLASH_COMMANDS: SlashCommandInfo[] = [",
      "  { command: '/clear',  description: 'Clear screen and chat history' },",
      "  { command: '/config', description: 'Open interactive config' },",
      "  { command: '/help',   description: 'Show this help' },",
      "  // ...",
      "];",
    ].join("\n"),
  );
  endTranscriptStep(false, DEMO_OPTS);

  // ── Turn 8: multiple tool calls in one step ─────────────────────────────────
  sectionLabel("multiple tool calls in one step (blank line between each)");
  beginTranscriptTurn(DEMO_OPTS);
  writeResponse(renderMarkdown("I'll read both renderer files in parallel.\n"));
  writeTool(
    "read_file",
    { path: "src/cli/transcript-renderer.ts" },
    "export function formatToolCallLine(name, args): string {\n  return chalk.cyan(`${displayName(name)}(${formatArgs(...)})`); \n}",
  );
  writeTool(
    "read_file",
    { path: "src/cli/markdown-renderer.ts" },
    "export function renderMarkdown(text: string): string {\n  if (!process.stdout.isTTY) return text;\n  // ...\n}",
  );
  endTranscriptStep(false, DEMO_OPTS);

  // ── Turn 9: tool error ──────────────────────────────────────────────────────
  sectionLabel("tool error");
  beginTranscriptTurn(DEMO_OPTS);
  writeResponse(
    renderMarkdown("Let me try to read a file that does not exist.\n"),
  );
  writeTranscriptToolLeadIn(DEMO_OPTS);
  transcriptOut().write(
    formatToolErrorLine(
      "read_file",
      new Error("ENOENT: no such file or directory, open 'src/missing.ts'"),
    ) + "\n",
  );
  endTranscriptStep(false, DEMO_OPTS);

  // ── Turn 10: markdown showcase ───────────────────────────────────────────────
  // Shows everything an agent might try, including unsupported elements that
  // fall through as plain text.
  sectionLabel(
    "markdown response — all formatting types (supported and unsupported)",
  );
  beginTranscriptTurn(DEMO_OPTS);
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
  writeResponse(renderMarkdown(markdownDemo) + "\n");
  endTranscriptStep(false, DEMO_OPTS);
}
