/**
 * @role Searches files using ripgrep (`rg`), which is a required freecode dependency. Results are sorted by file modification time (newest first) so recently-changed code surfaces first.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve, dirname, basename } from 'path';
import { stat } from 'fs/promises';
import { rgPath } from '@vscode/ripgrep';
import { resolveExistingProjectPath } from '../workspace.js';

const execFileAsync = promisify(execFile);

const MAX_LINE_LENGTH = 2000;
const RESULT_LIMIT = 100;
const MAX_RESULT_LIMIT = 1000;
const MAX_CONTEXT_LINES = 20;
const TIMEOUT_MS = 10000;
const MAX_BUFFER = 10 * 1024 * 1024;

type OutputMode = 'content' | 'files_with_matches' | 'count';

interface SearchOptions {
  include?: string;
  outputMode: OutputMode;
  caseInsensitive: boolean;
  contextLines: number;
  multiline: boolean;
  limit: number;
}

function buildArgs(pattern: string, target: string, opts: SearchOptions): string[] {
  // --no-require-git: rg applies .gitignore only inside a git repo by default, so a
  // checkout-less tree (or a worktree subdirectory) would have node_modules/bin/obj walked in full.
  // --null: rg then separates the path from the rest with a NUL instead of ':', so a filename
  // containing ':' still parses, and match (`:`) vs context (`-`) rows stay distinguishable.
  const args = [
    '--no-config',
    '--hidden',
    '--no-require-git',
    '--glob=!.git/*',
    '--no-messages',
    '--null',
    '--with-filename',
  ];

  if (opts.outputMode === 'files_with_matches') args.push('--files-with-matches');
  else if (opts.outputMode === 'count') args.push('--count');
  else args.push('-n', '--no-heading');

  if (opts.contextLines > 0 && opts.outputMode === 'content') {
    args.push(`--context=${opts.contextLines}`);
  }
  if (opts.caseInsensitive) args.push('-i');
  if (opts.multiline) args.push('--multiline', '--multiline-dotall');
  if (opts.include) args.push(`--glob=${opts.include}`);

  args.push('--', pattern, target);
  return args;
}

/** rg stdout, or a caller-facing message string when the run failed in a recoverable way. */
type RgResult = { stdout: string } | { message: string };

async function execRipgrep(args: string[], cwd: string): Promise<RgResult> {
  try {
    const { stdout } = await execFileAsync(rgPath, args, {
      cwd,
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
    return { stdout };
  } catch (err: unknown) {
    const e = err as {
      code?: number | string;
      signal?: string | null;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
    };
    // Node kills the child on maxBuffer overflow; rg never got to exit, so there is no exit code.
    if (e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return {
        message: `Search produced more than ${MAX_BUFFER / (1024 * 1024)}MB of output. Narrow it with a more specific "path" or an "include" glob.`,
      };
    }
    // Killed by the timeout: signalled rather than exited, so no exit code to interpret.
    if (e.killed || e.signal) {
      return {
        message: `Search timed out after ${TIMEOUT_MS / 1000}s. Narrow it with a more specific "path" or an "include" glob.`,
      };
    }
    if (e.code === 1) return { message: 'No matches found' };
    if (e.code === 2) {
      // Exit 2 is overloaded: unreadable paths (partial success) *and* usage errors such as a
      // malformed regex. --no-messages silences the former but not the latter, so stderr with
      // no stdout is a real failure and must not be reported as "No matches found".
      if (e.stdout) return { stdout: e.stdout };
      const detail = (e.stderr ?? '').trim();
      if (detail) return { message: `Search failed: ${detail.split('\n').slice(0, 3).join(' ')}` };
      return { message: 'No matches found' };
    }
    throw err;
  }
}

/** mtime per file, 0 when the file vanished between the search and the stat. */
async function statMtimes(files: string[], cwd: string): Promise<Map<string, number>> {
  const mtimes = new Map<string, number>();
  await Promise.all(
    files.map(async (f) => {
      try {
        const info = await stat(resolve(cwd, f));
        mtimes.set(f, info.mtimeMs);
      } catch {
        mtimes.set(f, 0);
      }
    }),
  );
  return mtimes;
}

/**
 * Orders `files` newest-first. The sort is only ever applied to sequences that rg already
 * emitted grouped by file, so JS sort stability keeps each file's rows in line order.
 */
async function sortByRecency<T>(items: T[], fileOf: (item: T) => string, cwd: string): Promise<T[]> {
  const mtimes = await statMtimes([...new Set(items.map(fileOf))], cwd);
  return [...items].sort((a, b) => (mtimes.get(fileOf(b)) ?? 0) - (mtimes.get(fileOf(a)) ?? 0));
}

function clip(text: string): string {
  return text.length > MAX_LINE_LENGTH ? text.slice(0, MAX_LINE_LENGTH) + '...' : text;
}

function truncationNotice(shown: number, total: number, unit: string): string {
  return `\n\n(Results truncated: showing ${shown} of ${total} ${unit} (${total - shown} hidden). Consider using a more specific path or pattern.)`;
}

/** Splits an rg row into its path and the remainder that follows the NUL separator. */
function splitNul(raw: string): { file: string; rest: string } | null {
  const nul = raw.indexOf('\0');
  if (nul < 0) return null;
  return { file: raw.slice(0, nul), rest: raw.slice(nul + 1) };
}

async function renderFilesWithMatches(stdout: string, cwd: string, limit: number): Promise<string> {
  // -l --null emits NUL-terminated paths with no line breaks at all.
  const files = stdout.split('\0').map((f) => f.trim()).filter(Boolean);
  if (files.length === 0) return 'No matches found';

  const sorted = await sortByRecency(files, (f) => f, cwd);
  const shown = sorted.slice(0, limit);
  const header = `Found ${files.length} file${files.length === 1 ? '' : 's'} with matches${files.length > limit ? ` (showing first ${limit})` : ''}`;
  const body = [header, ...shown].join('\n');
  return files.length > limit ? body + truncationNotice(limit, files.length, 'files') : body;
}

async function renderCounts(stdout: string, cwd: string, limit: number): Promise<string> {
  const rows: { file: string; count: number }[] = [];
  for (const raw of stdout.split('\n')) {
    const split = splitNul(raw.trimEnd());
    if (!split) continue;
    const count = parseInt(split.rest, 10);
    if (!isNaN(count)) rows.push({ file: split.file, count });
  }
  if (rows.length === 0) return 'No matches found';

  const sorted = await sortByRecency(rows, (r) => r.file, cwd);
  const shown = sorted.slice(0, limit);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const header = `Found ${total} matches in ${rows.length} file${rows.length === 1 ? '' : 's'}${rows.length > limit ? ` (showing first ${limit})` : ''}`;
  const body = [header, ...shown.map((r) => `${r.file}: ${r.count}`)].join('\n');
  return rows.length > limit ? body + truncationNotice(limit, rows.length, 'files') : body;
}

interface ContentRow {
  file: string;
  line: number;
  text: string;
  isMatch: boolean;
}

async function renderContent(stdout: string, cwd: string, limit: number): Promise<string> {
  const parsed: ContentRow[] = [];
  for (const raw of stdout.split('\n')) {
    // rg writes a bare "--" between context groups; it carries no NUL and is dropped here,
    // since the renderer re-derives group breaks from the line numbers themselves.
    const split = splitNul(raw.trimEnd());
    if (!split) continue;
    // `<line>:<text>` for a match, `<line>-<text>` for a context line.
    const m = /^(\d+)([:-])([\s\S]*)$/.exec(split.rest);
    if (!m) continue;
    parsed.push({
      file: split.file,
      line: parseInt(m[1], 10),
      text: m[3],
      isMatch: m[2] === ':',
    });
  }
  if (parsed.length === 0) return 'No matches found';

  const rows = await sortByRecency(parsed, (r) => r.file, cwd);

  // The limit counts matches, not rows, so asking for 100 results never yields fewer
  // than 100 matches just because context lines were requested.
  const total = rows.filter((r) => r.isMatch).length;
  const kept: ContentRow[] = [];
  let matches = 0;
  for (const r of rows) {
    if (r.isMatch) {
      if (matches >= limit) break;
      matches++;
    }
    kept.push(r);
  }

  const truncated = total > limit;
  // Both header figures are repo-wide totals; counting files over `kept` instead would
  // pair a full match count with a post-cap file count. "(showing first N)" and the
  // truncation notice carry what actually made it into the body.
  const files = new Set(rows.map((r) => r.file)).size;
  const out: string[] = [
    `Found ${total} matches in ${files} file${files === 1 ? '' : 's'}${truncated ? ` (showing first ${limit})` : ''}`,
  ];

  let currentFile = '';
  let prevLine = 0;
  for (const r of kept) {
    if (r.file !== currentFile) {
      if (currentFile !== '') out.push('');
      currentFile = r.file;
      out.push(`${r.file}:`);
    } else if (r.line > prevLine + 1) {
      out.push('  --');
    }
    prevLine = r.line;
    out.push(`  Line ${r.line}${r.isMatch ? ':' : '-'} ${clip(r.text)}`);
  }

  const body = out.join('\n');
  return truncated ? body + truncationNotice(limit, total, 'matches') : body;
}

async function runRipgrep(pattern: string, cwd: string, target: string, opts: SearchOptions): Promise<string> {
  const result = await execRipgrep(buildArgs(pattern, target, opts), cwd);
  if ('message' in result) return result.message;
  if (!result.stdout?.trim()) return 'No matches found';

  if (opts.outputMode === 'files_with_matches') return renderFilesWithMatches(result.stdout, cwd, opts.limit);
  if (opts.outputMode === 'count') return renderCounts(result.stdout, cwd, opts.limit);
  return renderContent(result.stdout, cwd, opts.limit);
}

export const grepTool = tool({
  description:
    'Search file contents for a regex pattern using ripgrep. ' +
    'Use output_mode "files_with_matches" to find which files are relevant, "content" to read the matching lines, ' +
    'or "count" for a per-file tally. Narrow broad searches with "path" (a directory or a single file) and ' +
    '"include" (e.g. "*.ts"). Results are sorted by file recency, newest first.',
  parameters: z.object({
    pattern: z.string().describe('The regex pattern to search for'),
    path: z.string().optional().describe('File or directory to search in (default: current directory)'),
    include: z.string().optional().describe('Glob pattern to filter files (e.g. "*.ts", "*.{ts,tsx}")'),
    output_mode: z
      .enum(['content', 'files_with_matches', 'count'])
      .optional()
      .describe('What to return: matching lines ("content", default), matching file paths, or per-file match counts'),
    case_insensitive: z.boolean().optional().describe('Match case-insensitively'),
    context_lines: z
      .number()
      .optional()
      .describe(`Lines of context to show around each match, 0-${MAX_CONTEXT_LINES} (content mode only)`),
    multiline: z.boolean().optional().describe('Let the pattern span newlines, with "." matching newlines too'),
    head_limit: z
      .number()
      .optional()
      .describe(`Max results to return, 1-${MAX_RESULT_LIMIT} (default ${RESULT_LIMIT})`),
  }),
  execute: async ({
    pattern,
    path = '.',
    include,
    output_mode = 'content',
    case_insensitive = false,
    context_lines = 0,
    multiline = false,
    head_limit,
  }) => {
    let fullPath: string;
    try {
      ({ fullPath } = await resolveExistingProjectPath(path));
    } catch (error) {
      return `Error searching: ${error instanceof Error ? error.message : String(error)}`;
    }

    // rg is always run from a directory: when `path` names a file, search its parent and pass
    // the basename as the target, so the file's own name still reaches rg's glob/type filters.
    let cwd = fullPath;
    let target = '.';
    try {
      if (!(await stat(fullPath)).isDirectory()) {
        cwd = dirname(fullPath);
        target = basename(fullPath);
      }
    } catch (error) {
      return `Error searching: ${error instanceof Error ? error.message : String(error)}`;
    }

    const opts: SearchOptions = {
      include,
      outputMode: output_mode,
      caseInsensitive: case_insensitive,
      contextLines: Math.min(Math.max(Math.trunc(context_lines), 0), MAX_CONTEXT_LINES),
      multiline,
      limit: head_limit === undefined ? RESULT_LIMIT : Math.min(Math.max(Math.trunc(head_limit), 1), MAX_RESULT_LIMIT),
    };

    try {
      return await runRipgrep(pattern, cwd, target, opts);
    } catch (error) {
      return `Error searching: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
