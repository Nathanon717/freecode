#!/usr/bin/env tsx
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_ROOT = join(ROOT, 'src');
const TESTS_ROOT = join(ROOT, 'tests');

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

function sourceToTestPath(sourcePath: string): string {
  const rel = relative(SRC_ROOT, sourcePath).replace(/\.ts$/, '.test.ts');
  return join(TESTS_ROOT, rel);
}

function testToSourcePath(testPath: string): string {
  const rel = relative(TESTS_ROOT, testPath).replace(/\.test\.ts$/, '.ts');
  return join(SRC_ROOT, rel);
}

const TEST_DECLARATION = /^\s*(it|test|describe)(\.[a-z]+)?\s*\(/m;
const ORPHAN_SUPPRESS = /\/\/\s*check-tests:\s*orphan\b/;

const failures: string[] = [];
const warnings: string[] = [];

const sourceFiles = walkFiles(SRC_ROOT, file => file.endsWith('.ts')).sort();
const testFiles = walkFiles(TESTS_ROOT, file => file.endsWith('.test.ts')).sort();

for (const sourceFile of sourceFiles) {
  const sourceRelative = toPosix(relative(ROOT, sourceFile));
  const expectedTest = sourceToTestPath(sourceFile);
  const testRelative = toPosix(relative(ROOT, expectedTest));

  if (!existsSync(expectedTest)) {
    failures.push(`${sourceRelative} is missing test file ${testRelative}.`);
    continue;
  }

  const content = readFileSync(expectedTest, 'utf-8');
  if (!TEST_DECLARATION.test(content)) {
    failures.push(`${testRelative} exists but contains no tests (it/test/describe).`);
  }
}

for (const testFile of testFiles) {
  const expectedSource = testToSourcePath(testFile);
  if (!existsSync(expectedSource)) {
    const content = readFileSync(testFile, 'utf-8');
    if (!ORPHAN_SUPPRESS.test(content)) {
      const testRelative = toPosix(relative(ROOT, testFile));
      warnings.push(`${testRelative} has no corresponding source file (add // check-tests: orphan to suppress).`);
    }
  }
}

if (warnings.length > 0) {
  console.warn('Test coverage warnings:');
  for (const warning of warnings) {
    console.warn(`  - ${warning}`);
  }
}

if (failures.length > 0) {
  console.error('Test coverage check failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}
