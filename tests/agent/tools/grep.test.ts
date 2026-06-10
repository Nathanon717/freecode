import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { grepTool } from '../../../src/agent/tools/grep.js';

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

  afterEach(async () => {
    await rm(GREP_TEST_FILE, { force: true });
  });
});
