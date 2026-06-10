import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, rm, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFileTool } from '../../../src/agent/tools/read-file.js';
import { writeFileTool } from '../../../src/agent/tools/write-file.js';
import { setProjectRoot } from '../../../src/agent/context.js';

const TEST_DIR = join(process.cwd(), 'tests', 'temp');

describe('tool integration: read_file', () => {
  it('reads package.json successfully', async () => {
    const result = await readFileTool.execute({ path: 'package.json' });
    expect(result).toContain('"name": "freecode"');
  });

  it('returns error for non-existent file', async () => {
    const result = await readFileTool.execute({ path: 'nonexistent-file-xyz.json' });
    expect(result).toContain('File not found');
  });

  it('rejects paths outside the project root', async () => {
    const result = await readFileTool.execute({ path: '../package.json' });
    expect(result).toContain('Path escapes project root');
  });

  it('rejects absolute paths', async () => {
    const result = await readFileTool.execute({ path: join(process.cwd(), 'package.json') });
    expect(result).toContain('Path must be relative to the project root');
  });

  it('rejects symlinks that resolve outside the project root', async () => {
    const { symlink } = await import('fs/promises');
    const root = await mkdtemp(join(tmpdir(), 'freecode-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'freecode-outside-'));
    const linkPath = join(root, 'outside-link');
    await writeFile(join(outside, 'secret.txt'), 'outside');
    try {
      await symlink(outside, linkPath, 'junction');
    } catch {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
      return;
    }

    setProjectRoot(root);
    try {
      const result = await readFileTool.execute({ path: 'outside-link/secret.txt' });
      expect(result).toContain('Path escapes project root');
    } finally {
      setProjectRoot(process.cwd());
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe('tool integration: chaining', () => {
  it('write then read returns same content', async () => {
    const originalContent = 'chain test content';
    await writeFile(join(TEST_DIR, 'chain-test.txt'), originalContent);

    const result = await readFileTool.execute({ path: 'tests/temp/chain-test.txt' });
    expect(result).toContain(originalContent);
  });

  afterEach(async () => {
    await rm(join(TEST_DIR, 'chain-test.txt'), { force: true });
  });
});
