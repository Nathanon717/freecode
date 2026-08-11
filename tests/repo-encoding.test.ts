// check-tests: orphan

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { hasBom } from '../src/util/text-encoding.js';

// A leading UTF-8 BOM has bitten this codebase before (silently breaks
// JSON.parse on config/eval/e2e files, and can slip into a .ts source
// file from an editor without any visible symptom). There is never a
// legitimate reason for one here, so this scans every tracked text file
// repo-wide rather than one directory at a time — see
// docs/ideas/we keep running into issues with st.txt for the motivating report.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const TEXT_EXTENSIONS = ['.ts', '.tsx', '.json', '.md', '.txt', '.yml', '.yaml', '.js', '.cjs', '.mjs'];

// `git ls-files` includes pending deletions still in the index; skip files
// that no longer exist in the working tree rather than failing on ENOENT.
const trackedFiles = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf-8' })
  .split('\n')
  .filter(f => f && TEXT_EXTENSIONS.some(ext => f.endsWith(ext)) && existsSync(join(ROOT, f)));

describe('tracked text files have no leading UTF-8 BOM', () => {
  it.each(trackedFiles)('%s', (file) => {
    const buf = readFileSync(join(ROOT, file));
    expect(hasBom(buf), `${file} starts with a UTF-8 BOM (EF BB BF) — strip it`).toBe(false);
  });
});

// CRLF is the same class of problem as a BOM: invisible, and it makes the
// generators disagree with the checkout. `docs:generate` writes LF, so a CRLF
// working tree reports a different line count for every source file and every
// map page comes back dirty. `.gitattributes` pins `eol=lf` to prevent it; this
// catches a file that got in some other way. `.cmd` is intentionally CRLF and
// is not a text extension here, so it is already out of scope.
describe('tracked text files use LF line endings', () => {
  it.each(trackedFiles)('%s', (file) => {
    const buf = readFileSync(join(ROOT, file));
    expect(buf.includes('\r\n'), `${file} has CRLF line endings — the repo is LF-only`).toBe(false);
  });
});
