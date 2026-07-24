// Pure parsing/highlighting for hand-typed tool calls (`name(arg=val, ...)`).
//
// Kept free of any `ai`-SDK import so it is safe to load on the early
// interactive boot path (bottom-ui imports the highlighter). The actual
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

export interface ToolParam {
  name: string;
  // String-typed params get autofilled with empty quotes (`key=""`); everything
  // else (numbers, booleans) autofills bare (`key=`).
  quoted: boolean;
}

// Ordered parameter list per tool, used to autofill the argument skeleton when
// a tool call is opened. Mirrors each tool's zod schema in src/agent/tools/ —
// order, names, and string-ness must match. A drift guard test in
// tests/cli/tool-runner.test.ts checks this against the real schemas.
export const TOOL_PARAMS: Record<ToolName, readonly ToolParam[]> = {
  read: [
    { name: 'path', quoted: true },
    { name: 'offset', quoted: false },
    { name: 'limit', quoted: false },
  ],
  grep: [
    { name: 'pattern', quoted: true },
    { name: 'path', quoted: true },
    { name: 'include', quoted: true },
    { name: 'output_mode', quoted: true },
    { name: 'case_insensitive', quoted: false },
    { name: 'context_lines', quoted: false },
    { name: 'multiline', quoted: false },
    { name: 'head_limit', quoted: false },
  ],
  list_dir: [{ name: 'path', quoted: true }],
  create: [
    { name: 'path', quoted: true },
    { name: 'content', quoted: true },
  ],
  edit: [
    { name: 'path', quoted: true },
    { name: 'old_text', quoted: true },
    { name: 'new_text', quoted: true },
  ],
  shell_exec: [
    { name: 'command', quoted: true },
    { name: 'timeout_ms', quoted: false },
    { name: 'confirmDestructive', quoted: false },
  ],
};

// The `(arg=val, ...)` text to insert after a freshly-typed tool name, plus the
// caret offset (into that text) at which the cursor should land — inside the
// first param's value slot, i.e. between the quotes of `path=""` or right after
// the `=` of a bare param. Tab/Backspace then move between slots.
export function buildToolCallSkeleton(name: ToolName): {
  text: string;
  caret: number;
} {
  const params = TOOL_PARAMS[name];
  const parts = params.map((p) => (p.quoted ? `${p.name}=""` : `${p.name}=`));
  const text = `(${parts.join(', ')})`;
  const first = params[0];
  const caret = first ? 1 + first.name.length + (first.quoted ? 2 : 1) : 1;
  return { text, caret };
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

// One value slot within an argument list, with positions relative to the args
// text (the run between the outer parens). `valStart`/`valEnd` bound the inner
// value content — after the opening quote and before the closing quote for a
// quoted value — so they double as the caret target for tabstop navigation and
// are equal when the slot is empty. This is the single grammar walker: both
// argument coercion and Tab/Backspace navigation derive from it, so their
// quote/bracket handling can never drift apart.
export interface FieldSlot {
  key: string;
  rawValue: string; // trimmed value text as typed, quotes included; '' if empty
  quoted: boolean;
  hasEq: boolean;
  partStart: number;
  partEnd: number;
  valStart: number;
  valEnd: number;
}

// Top-level comma-separated part ranges, ignoring commas inside quotes or
// brackets. Matches the emptiness rule of the old string split: a trailing empty
// part is kept only when at least one comma was seen.
function splitTopLevelRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '[' || c === '{' || c === '(') { depth++; continue; }
    if (c === ']' || c === '}' || c === ')') { depth--; continue; }
    if (c === ',' && depth === 0) { ranges.push({ start, end: i }); start = i + 1; }
  }
  if (text.slice(start).trim() !== '' || ranges.length > 0) {
    ranges.push({ start, end: text.length });
  }
  return ranges;
}

function fieldFromRange(text: string, start: number, end: number): FieldSlot {
  const raw = text.slice(start, end);
  const eq = raw.indexOf('=');
  if (eq === -1) {
    return { key: '', rawValue: '', quoted: false, hasEq: false, partStart: start, partEnd: end, valStart: end, valEnd: end };
  }
  const key = raw.slice(0, eq).trim();
  const afterEq = raw.slice(eq + 1);
  const lead = afterEq.length - afterEq.replace(/^\s+/, '').length;
  const trimmed = afterEq.trim();
  const valStart = start + eq + 1 + lead;
  const valEnd = valStart + trimmed.length;
  const q = trimmed[0];
  if (q === '"' || q === "'") {
    const closed = trimmed.length >= 2 && trimmed[trimmed.length - 1] === q;
    return {
      key,
      rawValue: trimmed,
      quoted: true,
      hasEq: true,
      partStart: start,
      partEnd: end,
      valStart: valStart + 1,
      valEnd: closed ? valEnd - 1 : valEnd,
    };
  }
  return { key, rawValue: trimmed, quoted: false, hasEq: true, partStart: start, partEnd: end, valStart, valEnd };
}

function scanFields(argsText: string): FieldSlot[] {
  return splitTopLevelRanges(argsText).map((r) => fieldFromRange(argsText, r.start, r.end));
}

// Whole-buffer template match: leading whitespace, a valid tool name, `(`, args,
// `)`, trailing whitespace. Returns the field slots with positions shifted into
// absolute buffer offsets, or null when the buffer is not a tool-call template
// (so callers fall back to their normal editing behaviour).
const TEMPLATE_RE = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\(([\s\S]*)\)(\s*)$/;

export function toolCallSlots(buffer: string): FieldSlot[] | null {
  const m = TEMPLATE_RE.exec(buffer);
  if (!m || !isToolName(m[2])) return null;
  const base = m[1].length + m[2].length + 1; // past leading ws, name, and '('
  return scanFields(m[3])
    .filter((f) => f.hasEq)
    .map((f) => ({
      ...f,
      partStart: f.partStart + base,
      partEnd: f.partEnd + base,
      valStart: f.valStart + base,
      valEnd: f.valEnd + base,
    }));
}

// Cyclic Tab target: the value slot after the one the cursor sits in (or the
// first slot when the cursor is outside any slot). Returns null when the buffer
// is not a tool call or has no fields, so Tab falls back to command completion.
export function nextToolFieldCaret(buffer: string, cursor: number): number | null {
  const slots = toolCallSlots(buffer);
  if (!slots || slots.length === 0) return null;
  const idx = slots.findIndex((s) => cursor >= s.partStart && cursor <= s.partEnd);
  return slots[(idx + 1) % slots.length].valEnd;
}

// Backspace at an emptied value slot: navigate rather than eat the skeleton.
//  - number → move the caret to the previous slot's value (append point);
//  - 'block' → the first slot is empty, swallow the keypress (skeleton stays);
//  - null → not at an empty slot start, so do a normal backspace.
export function toolFieldBackspace(buffer: string, cursor: number): 'block' | number | null {
  const slots = toolCallSlots(buffer);
  if (!slots) return null;
  const idx = slots.findIndex((s) => s.valStart === s.valEnd && cursor === s.valStart);
  if (idx === -1) return null;
  if (idx === 0) return 'block';
  return slots[idx - 1].valEnd;
}

function isEmptyRawValue(raw: string): boolean {
  return raw === '' || raw === '""' || raw === "''";
}

// Drops autofilled-but-untouched args (`key=`, `key=""`) from a submitted tool
// call so tabbed-past optional params are simply omitted. Leaves non-tool input
// and already-clean calls untouched.
export function stripEmptyToolArgs(input: string): string {
  const m = TEMPLATE_RE.exec(input);
  if (!m || !isToolName(m[2])) return input;
  const kept = scanFields(m[3])
    .filter((f) => f.hasEq && f.key && !isEmptyRawValue(f.rawValue))
    .map((f) => `${f.key}=${f.rawValue}`);
  return `${m[1]}${m[2]}(${kept.join(', ')})${m[4]}`;
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
  for (const f of scanFields(argsText)) {
    if (!f.hasEq || !f.key) continue;
    args[f.key] = coerceValue(f.rawValue);
  }
  return args;
}
