/**
 * Which non-map docs mention the source files you just changed.
 *
 * Cross-references uncommitted `src/` changes against every prose doc so
 * `docs:generate` can print the update obligation when it is actionable,
 * rather than parking it in a static section on a page nobody opens.
 */
import { execFileSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Uncommitted `src/**` changes, worktree and index alike. The report is
 * advisory, so a repo without git — or without a commit yet — reports nothing
 * rather than failing the run that hosts it.
 */
function changedSourceFiles(): string[] {
  let output: string;
  try {
    output = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', 'src'], {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return [];
  }

  return output.split('\n').map(line => line.trim()).filter(line => line.endsWith('.ts'));
}

/**
 * Docs that describe current behavior, and only those — the report is an
 * update obligation, so a doc nobody should update on a code change does not
 * belong in it.
 *
 * `docs/map/` is kept in step by the generator and the map checker. `bug log/`
 * and `sessions/` are dated records of what happened: a bug log entry that
 * still names a file you changed is correct history, not a stale doc.
 */
const ARCHIVES = ['map', 'bug log', 'sessions'].map(dir => join(ROOT, 'docs', dir));

function proseDocs(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) return ARCHIVES.includes(fullPath) ? [] : walk(fullPath);
      return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : [];
    });

  const rootGuides = readdirSync(ROOT, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => join(ROOT, entry.name));

  return [...walk(join(ROOT, 'docs')), ...rootGuides].sort();
}

/**
 * One line per doc that names a changed file. Empty string when nothing
 * changed or nothing mentions it, so the caller prints only when there is an
 * obligation to report.
 */
export function renderDocReferenceReport(): string {
  const changed = changedSourceFiles();
  if (changed.length === 0) return '';

  const lines: string[] = [];
  for (const doc of proseDocs()) {
    const content = readFileSync(doc, 'utf-8');
    const mentioned = changed.filter(file => content.includes(file));
    if (mentioned.length > 0) {
      lines.push(`  - ${toPosix(relative(ROOT, doc))} → ${mentioned.join(', ')}`);
    }
  }

  if (lines.length === 0) return '';
  return [`You changed ${changed.length} source file(s); these docs mention them:`, ...lines].join('\n');
}
