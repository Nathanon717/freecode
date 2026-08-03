#!/usr/bin/env tsx
/**
 * Dead-code and staleness sweep.
 *
 * Unit = one `src/**\/*.ts` file. Each unit's prompt carries the file plus a
 * reference table: for every symbol the file exports, the actual lines where
 * that name occurs across `src/`, `tests/`, `scripts/` and `docs/`.
 *
 * The table is the point. A file alone cannot answer "is this used?", and a bare
 * count ("0 references") is a number the model cannot audit — it either
 * rubber-stamps it or ignores it. Inlining the matching lines is what lets the
 * model separate the cases that look identical from a count: a symbol whose only
 * hit is a generated map page (documented, unused), one used only inside its own
 * file (unexport it), and one reached through a registry or string dispatch
 * (live, and visible only by reading the line).
 *
 * Why an LLM at all, when `@typescript-eslint/no-unused-vars` and `strict`
 * already run: those zero out unused locals, imports and parameters, and nothing
 * in the repo detects an unused *export*, a branch that no input can reach, or a
 * comment describing behaviour the file lost three refactors ago.
 *
 * This is a sweep — one bare LLM call per file, concurrent, findings-only
 * report. Everything that is not specific to dead code (flags, concurrency, the
 * report, HTTP diagnostics, free-only credentials) lives in `scripts/sweep/`.
 * See docs/sweeps.md.
 *
 * Usage:
 *   npm run dead-code                            # config's defaultModel
 *   npm run dead-code -- --model zen:big-pickle
 *   npm run dead-code -- --only providers/ --limit 5   # fast prompt-iteration loop
 *
 * Flags: see docs/sweeps.md — every sweep takes the same set.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import { classify as classifyDead } from './dead-code-classify.js';
import {
  buildExportRecords,
  collectExports,
  indexReferences,
  type ReferenceRole,
  type ScannedFile,
} from './dead-code-index.js';
import { SYSTEM_PROMPT, buildUserPrompt, type PromptUnit } from './dead-code-prompt.js';
import { runSweep, type SweepVerdict } from '../sweep/sweep.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SRC_ROOT = join(ROOT, 'src');

/** Where a name may occur. Units come from `src/` only; the rest is evidence. */
const CORPUS: Array<{ dir: string; ext: string; role: ReferenceRole }> = [
  { dir: 'src', ext: '.ts', role: 'code' },
  { dir: 'tests', ext: '.ts', role: 'code' },
  { dir: 'scripts', ext: '.ts', role: 'code' },
  { dir: 'docs', ext: '.md', role: 'docs' },
];

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

function walkFiles(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath, ext);
    if (!entry.isFile() || !fullPath.endsWith(ext)) return [];
    return [fullPath];
  });
}

function collectFiles(): PromptUnit[] {
  const sourceFiles = walkFiles(SRC_ROOT, '.ts').sort();
  const sources = new Map(
    sourceFiles.map(file => [toPosix(relative(ROOT, file)), readFileSync(file, 'utf-8')]),
  );

  const corpus: ScannedFile[] = CORPUS.flatMap(({ dir, ext, role }) =>
    walkFiles(join(ROOT, dir), ext).sort().map(file => {
      const rel = toPosix(relative(ROOT, file));
      return { relative: rel, text: sources.get(rel) ?? readFileSync(file, 'utf-8'), role };
    }),
  );

  const sites = new Map([...sources].map(([rel, text]) => [rel, collectExports(text)]));
  const names = new Set([...sites.values()].flat().map(site => site.name));
  const index = indexReferences(corpus, names);

  const units = [...sources].map(([rel, code]) => ({
    relative: rel,
    code,
    exports: buildExportRecords(rel, sites.get(rel) ?? [], index),
  }));

  // Computed over every file, not the --only subset, so the precompute's own
  // hit rate is visible on a --limit run too. The sweep applies --only/--limit
  // after this returns, for exactly that reason.
  const allExports = units.flatMap(unit => unit.exports);
  const unreferenced = allExports.filter(record => record.external.length === 0);
  console.log(
    `Reference index: ${allExports.length} exports across ${units.length} files, ` +
    `${unreferenced.length} with no reference outside their own file.`,
  );

  return units;
}

// `ok` is the only clean verdict; everything else earns a report line.
// `unparsed` is a finding on purpose — an answer nobody could read is a result
// about the model, not a pass.
function classify(text: string): SweepVerdict {
  const { verdict, detail, recovered } = classifyDead(text);
  return { verdict, detail, recovered, finding: verdict !== 'ok' };
}

runSweep<PromptUnit>(
  {
    name: 'Dead code',
    unitNoun: 'file',
    primaryVerdict: 'dead',
    collect: collectFiles,
    label: unit => unit.relative,
    describe: unit => `${unit.relative} (${unit.exports.length} exports, ${unit.exports.filter(e => e.external.length === 0).length} unreferenced)`,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt,
    classify,
  },
  process.argv.slice(2),
  { outDir: join(__dirname, 'dead-code') },
)
  .then(exitCode => { process.exitCode = exitCode; })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
