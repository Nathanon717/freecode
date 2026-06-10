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

const missingTests: string[] = [];
const emptyTests: string[] = [];
const warnings: string[] = [];

const sourceFiles = walkFiles(SRC_ROOT, file => file.endsWith('.ts')).sort();
const testFiles = walkFiles(TESTS_ROOT, file => file.endsWith('.test.ts')).sort();

for (const sourceFile of sourceFiles) {
  const sourceRelative = toPosix(relative(ROOT, sourceFile));
  const expectedTest = sourceToTestPath(sourceFile);
  const testRelative = toPosix(relative(ROOT, expectedTest));

  if (!existsSync(expectedTest)) {
    missingTests.push(sourceRelative);
    continue;
  }

  const content = readFileSync(expectedTest, 'utf-8');
  if (!TEST_DECLARATION.test(content)) {
    emptyTests.push(testRelative);
  }
}

for (const testFile of testFiles) {
  const expectedSource = testToSourcePath(testFile);
  if (!existsSync(expectedSource)) {
    const content = readFileSync(testFile, 'utf-8');
    if (!ORPHAN_SUPPRESS.test(content)) {
      const testRelative = toPosix(relative(ROOT, testFile));
      warnings.push(testRelative);
    }
  }
}

if (warnings.length > 0) {
  console.warn('Test coverage warnings — orphan test files (add // check-tests: orphan to suppress):');
  for (const w of warnings) console.warn(`  - ${w}`);
}

const failed = missingTests.length > 0 || emptyTests.length > 0;

if (missingTests.length > 0) {
  console.error('Test coverage check failed — missing test files:');
  for (const f of missingTests) console.error(`  - ${f}`);
}

if (emptyTests.length > 0) {
  console.error('Test coverage check failed — test files with no tests (it/test/describe):');
  for (const f of emptyTests) console.error(`  - ${f}`);
}

if (failed) process.exit(1);
