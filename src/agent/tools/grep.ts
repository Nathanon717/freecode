import { tool } from 'ai';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';
import { stat } from 'fs/promises';
import { rgPath } from '@vscode/ripgrep';
import { resolveExistingProjectPath } from '../context.js';

const execFileAsync = promisify(execFile);

const MAX_LINE_LENGTH = 2000;
const RESULT_LIMIT = 100;

async function runRipgrep(pattern: string, cwd: string, include?: string): Promise<string> {
  const args = ['--no-config', '-n', '--no-heading', '--hidden', '--glob=!.git/*', '--no-messages'];
  if (include) args.push(`--glob=${include}`);
  args.push('--', pattern, '.');

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(rgPath, args, { cwd, timeout: 10000, maxBuffer: 10 * 1024 * 1024 }));
  } catch (err: unknown) {
    // exit code 1 = no matches, exit code 2 = partial (some inaccessible paths)
    const e = err as { code?: number | string; stdout?: string };
    if (e.code === 1) return 'No matches found';
    if (e.code === 2) stdout = e.stdout ?? '';
    else throw err;
  }

  if (!stdout?.trim()) return 'No matches found';

  // Parse "file:line:text" lines
  interface Row { file: string; line: number; text: string; mtime: number }
  const parsed: Omit<Row, 'mtime'>[] = [];
  for (const raw of stdout.split('\n')) {
    const trimmed = raw.trimEnd();
    if (!trimmed) continue;
    // rg output: relative/path/to/file:42:matched text
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;
    const afterFile = trimmed.indexOf(':', colonIdx + 1);
    if (afterFile < 0) continue;
    const file = trimmed.slice(0, colonIdx);
    const lineNum = parseInt(trimmed.slice(colonIdx + 1, afterFile), 10);
    const text = trimmed.slice(afterFile + 1);
    if (!isNaN(lineNum)) parsed.push({ file, line: lineNum, text });
  }

  if (parsed.length === 0) return 'No matches found';

  // Stat unique files concurrently for mtime-based sorting
  const uniqueFiles = [...new Set(parsed.map((r) => r.file))];
  const mtimes = new Map<string, number>();
  await Promise.all(
    uniqueFiles.map(async (f) => {
      try {
        const info = await stat(resolve(cwd, f));
        mtimes.set(f, info.mtimeMs);
      } catch {
        mtimes.set(f, 0);
      }
    }),
  );

  const rows: Row[] = parsed
    .filter((r) => mtimes.has(r.file))
    .map((r) => ({ ...r, mtime: mtimes.get(r.file)! }));

  rows.sort((a, b) => b.mtime - a.mtime);

  const total = rows.length;
  const truncated = total > RESULT_LIMIT;
  const final = truncated ? rows.slice(0, RESULT_LIMIT) : rows;

  const out: string[] = [`Found ${total} matches${truncated ? ` (showing first ${RESULT_LIMIT})` : ''}`];
  let currentFile = '';
  for (const r of final) {
    if (r.file !== currentFile) {
      if (currentFile !== '') out.push('');
      currentFile = r.file;
      out.push(`${r.file}:`);
    }
    const text = r.text.length > MAX_LINE_LENGTH ? r.text.slice(0, MAX_LINE_LENGTH) + '...' : r.text;
    out.push(`  Line ${r.line}: ${text}`);
  }

  if (truncated) {
    out.push('');
    out.push(
      `(Results truncated: showing ${RESULT_LIMIT} of ${total} matches (${total - RESULT_LIMIT} hidden). Consider using a more specific path or pattern.)`,
    );
  }

  return out.join('\n');
}

export const grepTool = tool({
  description:
    'Search for a regex pattern in files using ripgrep for fast, accurate results. ' +
    'Supports an optional include glob (e.g. "*.ts") to narrow the search. Results are sorted by file recency.',
  parameters: z.object({
    pattern: z.string().describe('The regex pattern to search for'),
    path: z.string().optional().describe('Directory to search in (default: current directory)'),
    include: z.string().optional().describe('Glob pattern to filter files (e.g. "*.ts", "*.{ts,tsx}")'),
  }),
  execute: async ({ pattern, path = '.', include }) => {
    let resolved;
    try {
      resolved = await resolveExistingProjectPath(path);
    } catch (error) {
      return `Error searching: ${error instanceof Error ? error.message : String(error)}`;
    }
    const cwd = resolved.fullPath;
    try {
      return await runRipgrep(pattern, cwd, include);
    } catch (error) {
      return `Error searching: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
