#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  MAP_SECTIONS,
  READ_WHEN_MAX_BULLETS,
  ROLE_MAX_CHARS,
  listMapPages,
  parseMapPage,
  type ParsedPage,
} from '../docgen/map-sections.js';
import { readModuleIntent } from '../docgen/map-intent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SRC_ROOT = join(ROOT, 'src');
const MAP_ROOT = join(ROOT, 'docs', 'map');
const MAP_NAV = join(MAP_ROOT, 'README.md');

function walkFiles(dir: string, predicate: (file: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath, predicate);
    if (!entry.isFile() || !predicate(fullPath)) return [];
    return [fullPath];
  });
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

function sourceToMapPath(sourcePath: string): string {
  const sourceRelative = relative(SRC_ROOT, sourcePath).replace(/\.ts$/, '.md');
  return join(MAP_ROOT, sourceRelative);
}

function mapToSourcePath(mapPath: string): string {
  const mapRelative = relative(MAP_ROOT, mapPath).replace(/\.md$/, '.ts');
  return join(SRC_ROOT, mapRelative);
}

const sourceFiles = walkFiles(SRC_ROOT, file => file.endsWith('.ts')).sort();
const mapFiles = listMapPages().map(page => join(MAP_ROOT, page));
const mapNav = existsSync(MAP_NAV) ? readFileSync(MAP_NAV, 'utf-8') : '';
const failures: string[] = [];

function validateMarkdownLinks(file: string): void {
  const content = readFileSync(file, 'utf-8');
  const linkPattern = /!?\[[^\]]*]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(content)) !== null) {
    const rawTarget = match[1].trim();
    const target = rawTarget.split(/\s+/)[0].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;

    const resolved = join(dirname(file), target);
    if (!existsSync(resolved)) {
      failures.push(`${toPosix(relative(ROOT, file))} links to missing file ${target}.`);
    }
  }
}

/**
 * The page-shape contract stated in docs/map/README.md: canonical sections
 * present and exactly spelled, in manifest order above the tail, no prose
 * outside a section, and Role/Read When within their caps.
 *
 * A generated section is never fixed on the page, so every failure that names
 * one names the thing that actually has to change: the source tag it is lifted
 * from, or `npm run docs:generate`.
 */
const SOURCE_TAG: Record<string, string> = { Role: '@role', 'Read When': '@readwhen' };

function checkPageShape(page: ParsedPage, sourceRelative: string): void {
  const at = `${page.path}:`;

  // The H1 is the one line of the head nothing generates, and the structure
  // tree reads its label (`map-exports.ts` → `pageLabel`), so a renamed source
  // file would otherwise leave a stale path in both.
  if (!page.title.startsWith(`${sourceRelative} `)) {
    failures.push(`${at} H1 is "${page.title}". It must start with "${sourceRelative}", then a label.`);
  } else if (!page.title.slice(sourceRelative.length).replace(/[\s—-]/g, '')) {
    failures.push(`${at} H1 has no label after the path.`);
  }

  const canonical = MAP_SECTIONS.filter(section => section.status === 'canonical');
  const present = new Map(page.sections.filter(s => s.status !== 'tail').map(s => [s.name, s]));

  for (const section of canonical) {
    // A page spells each reserved name once: `findSection` returns the first
    // match, so a second copy is a body a query silently never answers from.
    const copies = page.sections.filter(entry => entry.name === section.name).length;
    if (copies > 1) {
      failures.push(`${at} ## ${section.name} appears ${copies} times. Each reserved name is spelled once.`);
    }
    if (section.required && !present.has(section.name)) {
      const tag = SOURCE_TAG[section.name];
      failures.push(tag
        ? `${at} no ## ${section.name}. Add ${tag} to ${sourceRelative}.`
        : `${at} no ## ${section.name}. Run npm run docs:generate.`);
    }
  }

  for (const section of page.sections) {
    if (section.status === 'tail') continue;
    if (section.status === 'legacy') {
      failures.push(`${at} ## ${section.raw} is a retired section. Move the fact to the tail and delete it.`);
      continue;
    }
    if (section.syntax !== 'h2') {
      failures.push(`${at} **${section.raw}:** is an inline field. Every reserved field is an H2.`);
    } else if (section.raw !== section.name) {
      failures.push(`${at} ## ${section.raw} is an old spelling of ## ${section.name}.`);
    }
  }

  const order = page.sections
    .filter(section => section.status === 'canonical')
    .map(section => canonical.findIndex(entry => entry.name === section.name));
  if (order.some((rank, index) => index > 0 && rank < order[index - 1])) {
    failures.push(`${at} canonical sections are out of order. Expected ${canonical.map(s => s.name).join(' → ')}.`);
  }

  const firstTail = page.sections.findIndex(section => section.status === 'tail');
  if (firstTail !== -1) {
    const strays = page.sections.slice(firstTail).filter(section => section.status !== 'tail');
    for (const stray of strays) {
      failures.push(`${at} ## ${stray.name} sits below the tail. The generated head comes first.`);
    }
  }

  if (page.preamble) {
    const first = page.preamble.split('\n')[0].slice(0, 60);
    failures.push(`${at} prose outside every section: "${first}…". Put it under an H2.`);
  }
}

function checkIntentCaps(sourceAbsolute: string, sourceRelative: string): void {
  const { role, readWhen } = readModuleIntent(sourceAbsolute);

  if (role.length > ROLE_MAX_CHARS) {
    failures.push(`${sourceRelative}: @role is ${role.length} chars, over the ${ROLE_MAX_CHARS} cap.`);
  }

  const bullets = readWhen.split('\n').filter(line => /^\s*[-*]\s/.test(line)).length;
  if (bullets > READ_WHEN_MAX_BULLETS) {
    failures.push(`${sourceRelative}: @readwhen has ${bullets} bullets, over the ${READ_WHEN_MAX_BULLETS} cap.`);
  }
}

if (!existsSync(MAP_NAV)) {
  failures.push('docs/map/README.md is missing.');
}

for (const sourceFile of sourceFiles) {
  const expectedMap = sourceToMapPath(sourceFile);
  const sourceRelative = toPosix(relative(ROOT, sourceFile));
  const mapRelative = toPosix(relative(ROOT, expectedMap));

  if (!existsSync(expectedMap)) {
    failures.push(`${sourceRelative} is missing map page ${mapRelative}.`);
    continue;
  }

  if (mapNav && !mapNav.includes(toPosix(relative(MAP_ROOT, expectedMap)))) {
    failures.push(`${mapRelative} is not linked from docs/map/README.md.`);
  }

  const content = readFileSync(expectedMap, 'utf-8');
  if (!content.includes('<!-- BEGIN GENERATED EXPORTS -->')) {
    failures.push(`${mapRelative} is missing the generated exports block. Run npm run docs:generate.`);
    continue;
  }

  checkPageShape(parseMapPage(toPosix(relative(MAP_ROOT, expectedMap)), content), sourceRelative);
  checkIntentCaps(sourceFile, sourceRelative);
}

if (mapNav && !mapNav.includes('<!-- BEGIN GENERATED MAP STRUCTURE -->')) {
  failures.push('docs/map/README.md is missing the generated structure block. Run npm run docs:generate.');
}

for (const mapFile of mapFiles) {
  const sourceFile = mapToSourcePath(mapFile);
  const mapRelative = toPosix(relative(ROOT, mapFile));
  const sourceRelative = toPosix(relative(ROOT, sourceFile));

  if (!existsSync(sourceFile)) {
    failures.push(`${mapRelative} points to missing source file ${sourceRelative}.`);
  }
}

for (const mapFile of [MAP_NAV, ...mapFiles]) {
  if (existsSync(mapFile)) validateMarkdownLinks(mapFile);
}

if (failures.length > 0) {
  console.error('Codebase map check failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error('The page contract is docs/map/README.md § Page shape.');
  console.error('Update only the affected docs/map page(s), usually based on git diff --name-only.');
  process.exit(1);
}
