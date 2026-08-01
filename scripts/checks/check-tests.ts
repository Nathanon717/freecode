#!/usr/bin/env tsx
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
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
// A source file opts out of the mirrored-test requirement with an inline marker
// that MUST carry a reason: `// check-tests: no-test — <why>`. See docs/unit-tests.md.
const NO_TEST_EXEMPT = /\/\/\s*check-tests:\s*no-test\b(.*)$/m;

// Silent in the normal pipeline; pass --list-exempt to audit the exemption set on demand.
const LIST_EXEMPT = process.argv.includes('--list-exempt');

const missingTests: string[] = [];
const emptyTests: string[] = [];
const reasonlessExemptions: string[] = [];
const exemptions: string[] = [];
const warnings: string[] = [];

const sourceFiles = walkFiles(SRC_ROOT, file => file.endsWith('.ts')).sort();
const testFiles = walkFiles(TESTS_ROOT, file => file.endsWith('.test.ts')).sort();

for (const sourceFile of sourceFiles) {
  const sourceRelative = toPosix(relative(ROOT, sourceFile));
  const expectedTest = sourceToTestPath(sourceFile);
  const testRelative = toPosix(relative(ROOT, expectedTest));

  const exemptMatch = readFileSync(sourceFile, 'utf-8').match(NO_TEST_EXEMPT);
  if (exemptMatch) {
    const reason = exemptMatch[1].replace(/^[\s—:-]+/, '').trim();
    if (reason.length === 0) {
      reasonlessExemptions.push(sourceRelative);
    } else {
      exemptions.push(`${sourceRelative} — ${reason}`);
    }
    continue;
  }

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

if (LIST_EXEMPT) {
  // On-demand audit only — kept out of the normal pipeline output.
  console.log(`Test coverage — ${exemptions.length} file(s) exempt via // check-tests: no-test:`);
  for (const e of exemptions) console.log(`  - ${e}`);
}

if (warnings.length > 0) {
  console.warn('Test coverage warnings — orphan test files (no matching src/ file). Delete each one, or keep it with // check-tests: orphan (a reason after the marker is not enforced but expected — see docs/unit-tests.md):');
  for (const w of warnings) console.warn(`  - ${w}`);
}

const failed = missingTests.length > 0 || emptyTests.length > 0 || reasonlessExemptions.length > 0;

if (missingTests.length > 0) {
  console.error('Test coverage check failed — missing test files:');
  for (const f of missingTests) console.error(`  - ${f}`);
}

if (emptyTests.length > 0) {
  console.error('Test coverage check failed — test files with no tests (it/test/describe):');
  for (const f of emptyTests) console.error(`  - ${f}`);
}

if (reasonlessExemptions.length > 0) {
  console.error('Test coverage check failed — // check-tests: no-test needs a reason (e.g. `// check-tests: no-test — pure type declarations`):');
  for (const f of reasonlessExemptions) console.error(`  - ${f}`);
}

if (failed) process.exit(1);
