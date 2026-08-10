#!/usr/bin/env tsx
/**
 * Map-drift detector.
 *
 * Pairs every `src/**\/*.ts` file with its `docs/map/**\/*.md` page (the same
 * 1:1 path rule scripts/checks/check-map.ts enforces) and asks an LLM whether
 * the page's hand-written prose still matches the code, with the code as the
 * source of truth. Per pair the model answers `OK` or `DRIFT: <what drifted>`.
 *
 * The generated blocks (`<!-- BEGIN GENERATED ... -->`) are stripped before the
 * prompt is built: they are machine-synced from the same source we are already
 * sending, so they carry no signal and would just bait models into reporting
 * signature mismatches that `npm run docs:generate` fixes on its own.
 *
 * This is a sweep — one bare LLM call per pair, concurrent, findings-only
 * report. Everything that is not specific to map drift (flags, concurrency, the
 * report, HTTP diagnostics, free-only credentials) lives in `scripts/sweep/`.
 * See docs/sweeps.md.
 *
 * Usage:
 *   npm run map-drift                          # config's defaultModel
 *   npm run map-drift -- --model zen:big-pickle
 *   npm run map-drift -- --only agent/ --limit 5   # fast prompt-iteration loop
 *
 * Flags: see docs/sweeps.md — every sweep takes the same set.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import { classify as classifyDrift } from './map-drift-classify.js';
import { runSweep, type SweepVerdict } from '../sweep/sweep.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SRC_ROOT = join(ROOT, 'src');
const MAP_ROOT = join(ROOT, 'docs', 'map');

interface Pair {
  sourceRelative: string;
  mapRelative: string;
  code: string;
  page: string;
}

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

// Same rule as scripts/checks/check-map.ts (which has no exports to reuse).
function sourceToMapPath(sourcePath: string): string {
  return join(MAP_ROOT, relative(SRC_ROOT, sourcePath).replace(/\.ts$/, '.md'));
}

function stripGeneratedBlocks(page: string): string {
  return page
    .replace(/<!--\s*BEGIN GENERATED[\s\S]*?<!--\s*END GENERATED[^>]*-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectPairs(): Pair[] {
  const sourceFiles = walkFiles(SRC_ROOT, '.ts').sort();
  const pairs: Pair[] = [];
  const missing: string[] = [];

  for (const sourceFile of sourceFiles) {
    const sourceRelative = toPosix(relative(ROOT, sourceFile));
    const mapFile = sourceToMapPath(sourceFile);
    let page: string;
    try {
      page = readFileSync(mapFile, 'utf-8');
    } catch {
      // Recorded for every source file, not just the --only subset, so the
      // 1:1 pairing assumption is checked in full on every run. The sweep
      // applies --only/--limit after this returns, for exactly that reason.
      missing.push(sourceRelative);
      continue;
    }
    pairs.push({
      sourceRelative,
      mapRelative: toPosix(relative(ROOT, mapFile)),
      code: readFileSync(sourceFile, 'utf-8'),
      page: stripGeneratedBlocks(page),
    });
  }

  if (missing.length > 0) {
    // check-map.ts is the enforcer; here an unpaired file is just skipped work.
    console.warn(`Warning: ${missing.length} source file(s) have no map page: ${missing.join(', ')}`);
  }
  return pairs;
}

const SYSTEM_PROMPT = `You audit a codebase map for drift. You are given one source file and the hand-written map page that describes it. THE CODE IS THE SOURCE OF TRUTH.

The map is an agent-navigation layer, not documentation. Its rules:
- It exists purely for token reduction: it lets an agent decide which files matter WITHOUT reading them.
- Pages are deliberately terse. Brevity is correct, not a defect.
- Purpose and "read when" are generated from the source file's @role/@readwhen tags, and per-export intent is generated from each export's JSDoc. What is written on the page itself is the free-form tail below those blocks.
- Pages must NOT duplicate reference facts, exhaustive API listings, or implementation detail.
- EVERY generated block has been REMOVED before you see it — purpose, "read when", export signatures, neighbors, tests, budget and env are all gone. You are seeing only the authored tail. Their absence is not drift, and missing purpose/signature/API coverage is never drift.

Drift is ONLY where the tail's prose asserts something the code contradicts or no longer supports:
- named neighbors, exports, symbols, flags, or files that the code no longer references,
- claims about behaviour the code contradicts,
- a substantial responsibility the file now owns that the tail actively misrepresents.

Incompleteness is NOT drift. Terseness is NOT drift. Wanting more detail is NOT drift.

Answer format, exactly:
- First line: \`OK\` or \`DRIFT\`.
- If DRIFT: following lines list each drift as \`- <what the page claims> -> <what the code shows>\`. Be specific and cite the symbol or phrase. No preamble, no praise, no suggestions beyond the correction.`;

function buildUserPrompt(pair: Pair): string {
  return [
    `SOURCE FILE: ${pair.sourceRelative}`,
    '```typescript',
    pair.code,
    '```',
    '',
    `MAP PAGE: ${pair.mapRelative} (generated blocks stripped)`,
    '```markdown',
    pair.page,
    '```',
    '',
    'Does the map page prose drift from the code? Answer in the required format.',
  ].join('\n');
}

// `ok` is the only clean verdict; everything else is a finding worth a report
// line. `unparsed` is a finding on purpose — an answer nobody could read is a
// result about the model, not a pass.
function classify(text: string): SweepVerdict {
  const { verdict, detail, recovered } = classifyDrift(text);
  return { verdict, detail, recovered, finding: verdict !== 'ok' };
}

runSweep<Pair>(
  {
    name: 'Map drift',
    unitNoun: 'pair',
    primaryVerdict: 'drift',
    collect: collectPairs,
    label: pair => pair.sourceRelative,
    describe: pair => `${pair.sourceRelative} -> ${pair.mapRelative}`,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt,
    classify,
  },
  process.argv.slice(2),
  { outDir: join(__dirname, 'map-drift') },
)
  .then(exitCode => { process.exitCode = exitCode; })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
