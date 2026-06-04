#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
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
const mapFiles = walkFiles(MAP_ROOT, file => file.endsWith('.md'))
  .filter(file => relative(MAP_ROOT, file) !== 'README.md')
  .sort();
const mapNav = existsSync(MAP_NAV) ? readFileSync(MAP_NAV, 'utf-8') : '';
const failures: string[] = [];

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
}

for (const mapFile of mapFiles) {
  const sourceFile = mapToSourcePath(mapFile);
  const mapRelative = toPosix(relative(ROOT, mapFile));
  const sourceRelative = toPosix(relative(ROOT, sourceFile));

  if (!existsSync(sourceFile)) {
    failures.push(`${mapRelative} points to missing source file ${sourceRelative}.`);
  }
}

if (failures.length > 0) {
  console.error('Codebase map check failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error('Update only the affected docs/map page(s), usually based on git diff --name-only.');
  process.exit(1);
}

