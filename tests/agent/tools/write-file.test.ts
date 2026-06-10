import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, rm, mkdir, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFileTool } from '../../../src/agent/tools/read-file.js';
import { writeFileTool } from '../../../src/agent/tools/write-file.js';
import { setProjectRoot } from '../../../src/agent/context.js';

const TEST_DIR = join(process.cwd(), 'tests', 'temp');

describe('tool integration: write_file', () => {
  it('writes a new file successfully', async () => {
    const result = await writeFileTool.execute({
      path: 'tests/temp/test-write.txt',
      content: 'hello world',
    });
    expect(result).toContain('Wrote 11 bytes');
    expect(result).toContain('tests/temp/test-write.txt');
  });

  it('rejects an existing file', async () => {
    await mkdir(TEST_DIR, { recursive: true }).catch(() => {});
    await writeFile(join(TEST_DIR, 'test-write.txt'), 'existing content');

    const result = await writeFileTool.execute({
      path: 'tests/temp/test-write.txt',
      content: 'updated content',
    });

    expect(result).toContain('Error writing file');
    const readResult = await readFileTool.execute({ path: 'tests/temp/test-write.txt' });
    expect(readResult).toContain('existing content');
  });

  it('rejects paths outside the project root', async () => {
    const result = await writeFileTool.execute({
      path: '../outside-freecode.txt',
      content: 'outside',
    });
    expect(result).toContain('Path escapes project root');
  });

  it('rejects writes through a symlinked parent outside the project root', async () => {
    const { symlink } = await import('fs/promises');
    const root = await mkdtemp(join(tmpdir(), 'freecode-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'freecode-outside-'));
    const linkPath = join(root, 'outside-link');
    try {
      await symlink(outside, linkPath, 'junction');
    } catch {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
      return;
    }

    setProjectRoot(root);
    try {
      const result = await writeFileTool.execute({
        path: 'outside-link/escaped.txt',
        content: 'outside',
      });
      expect(result).toContain('Path escapes project root');
    } finally {
      setProjectRoot(process.cwd());
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    await rm(join(TEST_DIR, 'test-write.txt'), { force: true });
  });
});
