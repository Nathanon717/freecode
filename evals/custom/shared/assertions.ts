import { existsSync, readFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import type { CheckResult, ToolCall, TokenUsage } from './types.js';

export function formatOutputDiff(actual: string, expected: string): string {
  const gotLines = actual.split('\n');
  const expLines = expected.split('\n');
  const maxLen = Math.max(gotLines.length, expLines.length);
  const parts: string[] = ['output mismatch:'];
  for (let i = 0; i < maxLen; i++) {
    const got = gotLines[i];
    const exp = expLines[i];
    if (got === exp) continue;
    if (got !== undefined && exp !== undefined) {
      parts.push(`  got:      ${got || '(empty)'}`);
      parts.push(`  expected: ${exp || '(empty)'}`);
    } else if (got !== undefined && got !== '') {
      parts.push(`  extra got: ${got}`);
    } else if (exp !== undefined && exp !== '') {
      parts.push(`  missing:   ${exp}`);
    }
  }
  return parts.join('\n');
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

export function assertFileExists(workDir: string, filename: string): CheckResult {
  const exists = existsSync(join(workDir, filename));
  return {
    name: `file exists: ${filename}`,
    kind: 'assertion',
    pass: exists,
    message: exists ? undefined : `${filename} not found in work dir`,
  };
}

export function assertFileContent(workDir: string, filename: string, expected: string): CheckResult {
  const filePath = join(workDir, filename);
  if (!existsSync(filePath)) {
    return { name: `file content: ${filename}`, kind: 'assertion', pass: false, message: `${filename} does not exist` };
  }
  const actual = readFileSync(filePath, 'utf-8');
  const normalize = (s: string) => normalizeNewlines(s).trimEnd();
  const pass = normalize(actual) === normalize(expected);
  return {
    name: `file content: ${filename}`,
    kind: 'assertion',
    pass,
    message: pass ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  };
}

export function assertNoUnnecessaryTools(toolCalls: ToolCall[], allowedTools: string[]): CheckResult {
  // A single leading list_dir is always permitted — models often orient themselves first.
  const calls = toolCalls.length > 0 && toolCalls[0].tool === 'list_dir' ? toolCalls.slice(1) : toolCalls;
  const unnecessary = calls.filter(t => !allowedTools.includes(t.tool));
  const pass = unnecessary.length === 0;
  return {
    name: 'unnecessary tools:',
    kind: 'warning',
    pass,
    message: pass ? undefined : [...new Set(unnecessary.map(t => t.tool))].join(', '),
  };
}

export function assertStayedInWorkDir(toolCalls: ToolCall[], workDir: string): CheckResult {
  const resolvedWork = resolve(workDir);
  const prefix = resolvedWork + sep;
  const violations: string[] = [];

  for (const call of toolCalls) {
    for (const [key, val] of Object.entries(call.args)) {
      if (typeof val !== 'string') continue;
      if (key !== 'path' && key !== 'directory') continue;
      // Only flag paths that look absolute (contain a drive letter or start with /)
      if (!val.startsWith('/') && !/^[A-Za-z]:/.test(val)) continue;
      const abs = resolve(val);
      if (abs !== resolvedWork && !abs.startsWith(prefix)) {
        violations.push(`${call.tool}(${key}="${val}")`);
      }
    }
  }

  const pass = violations.length === 0;
  return {
    name: 'stayed in work dir',
    kind: 'assertion',
    pass,
    message: pass ? undefined : `tool calls outside work dir: ${violations.join(', ')}`,
  };
}

export function statTokens(tokens: TokenUsage): CheckResult {
  const parts = [`${tokens.total}`];
  if (tokens.prompt !== undefined) parts.push(`in: ${tokens.prompt}`);
  if (tokens.output !== undefined) parts.push(`out: ${tokens.output}`);
  return { name: 'tokens', kind: 'stat', value: tokens.total, note: parts.join(' | ') };
}

export function statToolCalls(toolCalls: ToolCall[]): CheckResult {
  const n = toolCalls.length;
  return {
    name: `${n} tool ${n === 1 ? 'call' : 'calls'}`,
    kind: 'stat',
    value: n,
    note: toolCalls.map(t => t.tool).join(' → ') || '(none)',
  };
}
