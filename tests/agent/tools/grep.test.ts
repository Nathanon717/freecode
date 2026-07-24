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

  afterEach(async () => {
    await rm(GREP_TEST_FILE, { force: true });
  });
});
