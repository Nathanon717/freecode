import { tool } from 'ai';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';
import { stat } from 'fs/promises';
import { projectRoot } from '../context.js';

const execFileAsync = promisify(execFile);

// Detect rg once at module load — no per-call overhead.
const rgAvailable: Promise<boolean> = execFileAsync('rg', ['--version'], { timeout: 5000 })
  .then(() => true)
  .catch(() => false);

const MAX_LINE_LENGTH = 2000;
const RESULT_LIMIT = 100;

async function grepWithRg(pattern: string, cwd: string, include?: string): Promise<string> {
  const args = ['--no-config', '-n', '--no-heading', '--hidden', '--glob=!.git/*', '--no-messages'];
  if (include) args.push(`--glob=${include}`);
  args.push('--', pattern, '.');

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('rg', args, { cwd, timeout: 10000, maxBuffer: 10 * 1024 * 1024 }));
  } catch (err: any) {
    // exit code 1 = no matches, exit code 2 = partial (some inaccessible paths)
    if (err.code === 1) return 'No matches found';
    if (err.code === 2) stdout = err.stdout ?? '';
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

async function grepWithFindstr(pattern: string, cwd: string): Promise<string> {
  const safePattern = pattern.replace(/"/g, '\\"');
  try {
    const { stdout } = await execFileAsync('findstr', ['/s', '/n', '/i', safePattern, '*'], {
      cwd,
      timeout: 10000,
      shell: true,
    });
    if (stdout.trim()) {
      const lines = stdout.split('\n').filter((l) => l.length > 0).slice(0, 50);
      return lines.join('\n');
    }
    return 'No matches found';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('not recognized') || msg.includes('not found') || msg.includes('exit code 1') || msg.includes('Command failed')) {
      return 'No matches found';
    }
    throw err;
  }
}

async function grepWithGrep(pattern: string, cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'grep', ['-rn', '--include=*', '-E', pattern, '.'],
      { cwd, timeout: 10000, maxBuffer: 10 * 1024 * 1024 },
    );
    if (!stdout.trim()) return 'No matches found';
    const lines = stdout.split('\n').filter((l) => l.trim()).slice(0, 100);
    return lines.join('\n');
  } catch (err: any) {
    if (err.code === 1) return 'No matches found';
    throw err;
  }
}

export const grepTool = tool({
  description:
    'Search for a regex pattern in files. Uses ripgrep when available for fast, accurate results. ' +
    'Supports an optional include glob (e.g. "*.ts") to narrow the search. Results are sorted by file recency.',
  parameters: z.object({
    pattern: z.string().describe('The regex pattern to search for'),
    path: z.string().optional().describe('Directory to search in (default: current directory)'),
    include: z.string().optional().describe('Glob pattern to filter files (e.g. "*.ts", "*.{ts,tsx}")'),
  }),
  execute: async ({ pattern, path = '.', include }) => {
    const cwd = resolve(projectRoot, path);
    try {
      if (await rgAvailable) {
        return await grepWithRg(pattern, cwd, include);
      }
      if (process.platform === 'win32') {
        return await grepWithFindstr(pattern, cwd);
      }
      return await grepWithGrep(pattern, cwd);
    } catch (error) {
      return `Error searching: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
