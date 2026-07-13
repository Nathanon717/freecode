// Pure parsing/highlighting for hand-typed tool calls (`name(arg=val, ...)`).
//
// Kept free of any `ai`-SDK import so it is safe to load on the early
// interactive boot path (terminal-ui imports the highlighter). The actual
// execution + `/tools` listing live in tool-runner.ts, which pulls in the tool
// registry and is only imported lazily from the command dispatcher.

import chalk from 'chalk';

// Canonical set of directly-invokable tool names. Mirrors createTools() in
// src/agent/tools/index.ts — keep in sync when tools are added or removed.
export const TOOL_NAMES = [
  'read',
  'grep',
  'list_dir',
  'create',
  'edit',
  'shell_exec',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const TOOL_NAME_SET = new Set<string>(TOOL_NAMES);

export function isToolName(name: string): name is ToolName {
  return TOOL_NAME_SET.has(name);
}

export interface HighlightRange {
  start: number;
  end: number;
}

// Longer names first so alternation never stops at a shorter prefix.
const HIGHLIGHT_RE = new RegExp(
  `(?<![A-Za-z0-9_])(${[...TOOL_NAMES]
    .sort((a, b) => b.length - a.length)
    .join('|')})(?=\\()`,
  'g',
);

// Char ranges within `line` naming a valid tool that is the leading token of
// the line and is immediately followed by `(`. Used to paint the tool name a
// pastel colour while the user types; args and parens stay the default colour.
export function toolNameHighlightRanges(line: string): HighlightRange[] {
  const ranges: HighlightRange[] = [];
  for (const m of line.matchAll(HIGHLIGHT_RE)) {
    const start = m.index ?? 0;
    if (line.slice(0, start).trim() !== '') continue; // leading token only
    ranges.push({ start, end: start + m[1].length });
  }
  return ranges;
}

// The identifier ending exactly at `cursor`, returned only when it is a valid
// tool name and the leading token of its logical line. Drives the auto-closing
// `(` → `()` affordance so it fires only for a genuine tool call.
export function toolNameBeforeCursor(
  buffer: string,
  cursor: number,
): ToolName | null {
  const before = buffer.slice(0, cursor);
  const m = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(before);
  if (!m || !isToolName(m[1])) return null;
  const lineStart = before.lastIndexOf('\n') + 1;
  const prefix = before.slice(lineStart, before.length - m[1].length);
  return prefix.trim() === '' ? m[1] : null;
}

// Pastel lavender used to tint a valid tool name in the input line.
const TOOL_NAME_COLOR = chalk.hex('#c9b3ff');

// Applies TOOL_NAME_COLOR to the portions of a rendered chunk that fall within
// `ranges` (absolute char offsets in the logical line). Colouring per-chunk —
// after the caller's visual-width slicing — keeps wrap math on raw char counts.
export function styleToolNames(
  chunk: string,
  chunkStart: number,
  ranges: HighlightRange[],
): string {
  if (ranges.length === 0) return chunk;
  let out = '';
  let i = 0;
  while (i < chunk.length) {
    const abs = chunkStart + i;
    const range = ranges.find((r) => abs >= r.start && abs < r.end);
    if (range) {
      const end = Math.min(chunk.length, range.end - chunkStart);
      out += TOOL_NAME_COLOR(chunk.slice(i, end));
      i = end;
    } else {
      let next = chunk.length;
      for (const r of ranges) {
        const s = r.start - chunkStart;
        if (s > i && s < next) next = s;
      }
      out += chunk.slice(i, next);
      i = next;
    }
  }
  return out;
}

export interface ParsedInvocation {
  name: ToolName;
  args: Record<string, unknown>;
}

// Parses a whole input line of the form `name(arg=val, ...)`. Returns null when
// the line is not a complete, valid tool invocation so it falls through to the
// agent. Never throws — malformed args yield a best-effort object.
export function parseToolInvocation(input: string): ParsedInvocation | null {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\(([\s\S]*)\)$/.exec(input.trim());
  if (!m || !isToolName(m[1])) return null;
  return { name: m[1], args: parseToolArgs(m[2]) };
}

// Splits on top-level commas, ignoring commas inside quotes or brackets.
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      cur += c;
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '[' || c === '{' || c === '(') { depth++; cur += c; continue; }
    if (c === ']' || c === '}' || c === ')') { depth--; cur += c; continue; }
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '' || parts.length > 0) parts.push(cur);
  return parts;
}

// Coerces a raw value: quoted → literal string, otherwise JSON when it parses
// (numbers, booleans, null, arrays, objects), else the bare string as typed.
function coerceValue(raw: string): unknown {
  if (raw === '') return '';
  const first = raw[0];
  if (
    (first === '"' || first === "'") &&
    raw.length >= 2 &&
    raw[raw.length - 1] === first
  ) {
    if (first === '"') {
      try { return JSON.parse(raw); } catch { /* fall through to strip */ }
    }
    return raw.slice(1, -1);
  }
  try { return JSON.parse(raw); } catch { return raw; }
}

export function parseToolArgs(argsText: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const part of splitTopLevel(argsText)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    args[key] = coerceValue(part.slice(eq + 1).trim());
  }
  return args;
}
