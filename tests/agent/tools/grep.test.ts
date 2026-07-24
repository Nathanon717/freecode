import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, rm, mkdir, mkdtemp, realpath } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { grepTool } from '../../../src/agent/tools/grep.js';
import { projectRoot, setProjectRoot } from '../../../src/agent/workspace.js';

const GREP_TEST_FILE = join(process.cwd(), 'tests', 'test-grep-fixture.ts');

describe('tool integration: grep', () => {
  beforeEach(async () => {
    const needle = ['freecode', 'grep', 'fixture'].join('-');
    await writeFile(GREP_TEST_FILE, `alpha\n${needle}\nomega\n`);
  });

  it('finds pattern in files', async () => {
    const needle = ['freecode', 'grep', 'fixture'].join('-');
    const result = await grepTool.execute({ pattern: needle, path: 'tests' });
    expect(result).toContain('test-grep-fixture.ts');
    expect(result).toContain(needle);
  });

  it('returns "No matches found" for non-existent pattern', async () => {
    const missingNeedle = ['xyz', 'non-existent', 'pattern', '123'].join('-');
    const result = await grepTool.execute({ pattern: missingNeedle, path: 'tests' });
    expect(result).toBe('No matches found');
  });

  it('rejects paths outside the project root', async () => {
    const result = await grepTool.execute({ pattern: 'anything', path: '..' });
    expect(result).toContain('Path escapes project root');
  });

  // Must live outside any git checkout: rg honors .gitignore inside a repo regardless of
  // the flag, so a fixture under tests/ would pass whether or not --no-require-git is set.
  it('honors .gitignore in a tree that has no .git (--no-require-git)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'freecode-grep-nogit-'));
    const previousRoot = projectRoot;
    const needle = ['freecode', 'nogit', 'needle'].join('-');
    try {
      await mkdir(join(root, 'build'), { recursive: true });
      await writeFile(join(root, '.gitignore'), 'build/\n');
      await writeFile(join(root, 'kept.ts'), `${needle}\n`);
      await writeFile(join(root, 'build', 'ignored.ts'), `${needle}\n`);
      setProjectRoot(await realpath(root));

      const result = await grepTool.execute({ pattern: needle, path: '.' });
      expect(result).toContain('kept.ts');
      expect(result).not.toContain('ignored.ts');
    } finally {
      setProjectRoot(previousRoot);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts a single file as the search path', async () => {
    const needle = ['freecode', 'grep', 'fixture'].join('-');
    const result = await grepTool.execute({
      pattern: needle,
      path: 'tests/test-grep-fixture.ts',
    });
    expect(result).toContain('test-grep-fixture.ts');
    expect(result).toContain('Line 2:');
  });

  it('matches case-insensitively when asked', async () => {
    const needle = ['freecode', 'grep', 'fixture'].join('-');
    const shouted = needle.toUpperCase();
    expect(await grepTool.execute({ pattern: shouted, path: 'tests' })).toBe('No matches found');

    const result = await grepTool.execute({ pattern: shouted, path: 'tests', case_insensitive: true });
    expect(result).toContain('test-grep-fixture.ts');
  });

  it('returns paths without match text in files_with_matches mode', async () => {
    const needle = ['freecode', 'grep', 'fixture'].join('-');
    const result = await grepTool.execute({
      pattern: needle,
      path: 'tests',
      output_mode: 'files_with_matches',
    });
    expect(result).toContain('test-grep-fixture.ts');
    expect(result).not.toContain(needle);
  });

  it('surfaces a malformed regex rather than claiming there were no matches', async () => {
    const result = await grepTool.execute({ pattern: 'foo(', path: 'tests' });
    expect(result).toContain('Search failed:');
    expect(result).not.toBe('No matches found');
  });

  // The NUL separator exists for exactly this case: a ':' in the filename is
  // indistinguishable from rg's own field separator without it.
  it('parses paths containing a colon', async () => {
    const root = await mkdtemp(join(tmpdir(), 'freecode-grep-colon-'));
    const previousRoot = projectRoot;
    const needle = ['freecode', 'colon', 'needle'].join('-');
    try {
      await writeFile(join(root, 'we:ird.ts'), `${needle}\n`);
      setProjectRoot(await realpath(root));

      const result = await grepTool.execute({ pattern: needle, path: '.' });
      expect(result).toContain('we:ird.ts');
      expect(result).toContain(`Line 1: ${needle}`);
    } finally {
      setProjectRoot(previousRoot);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('matches across newlines in multiline mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'freecode-grep-multiline-'));
    const previousRoot = projectRoot;
    try {
      await writeFile(join(root, 'multi.ts'), 'start\nfoo(\n  bar\n)\nend\n');
      setProjectRoot(await realpath(root));

      expect(await grepTool.execute({ pattern: 'foo\\(.*?\\)', path: '.' })).toBe('No matches found');

      const result = await grepTool.execute({ pattern: 'foo\\(.*?\\)', path: '.', multiline: true });
      expect(result).toContain('multi.ts');
      expect(result).toContain('Line 2:');
      expect(result).toContain('Line 4:');
    } finally {
      setProjectRoot(previousRoot);
      await rm(root, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    await rm(GREP_TEST_FILE, { force: true });
  });
});
