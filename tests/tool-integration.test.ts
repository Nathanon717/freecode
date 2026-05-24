import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { readFileTool } from '../src/agent/tools/read-file.js';
import { writeFileTool } from '../src/agent/tools/write-file.js';
import { editFileTool } from '../src/agent/tools/edit-file.js';
import { listDirTool } from '../src/agent/tools/list-dir.js';
import { grepTool } from '../src/agent/tools/grep.js';

const TEST_DIR = join(process.cwd(), 'tests', 'temp');

describe('tool integration: read_file', () => {
  it('reads package.json successfully', async () => {
    const result = await readFileTool.execute({ path: 'package.json' });
    expect(result).toContain('"name": "freecode"');
  });

  it('returns error for non-existent file', async () => {
    const result = await readFileTool.execute({ path: 'nonexistent-file-xyz.json' });
    expect(result).toContain('Error');
  });
});

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
    expect(readResult).toBe('existing content');
  });

  afterEach(async () => {
    try {
      await unlink(join(TEST_DIR, 'test-write.txt'));
    } catch {}
  });
});

describe('tool integration: edit_file', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true }).catch(() => {});
  });

  it('replaces one exact text occurrence', async () => {
    await writeFile(join(TEST_DIR, 'test-edit.txt'), 'alpha\nbeta\ngamma\n');
    await readFileTool.execute({ path: 'tests/temp/test-edit.txt' });

    const result = await editFileTool.execute({
      path: 'tests/temp/test-edit.txt',
      old_text: 'beta',
      new_text: 'delta',
    });

    expect(result).toContain('Edited tests/temp/test-edit.txt');
    await expect(readFileTool.execute({ path: 'tests/temp/test-edit.txt' })).resolves.toBe('alpha\ndelta\ngamma\n');
  });

  it('rejects missing old_text', async () => {
    await writeFile(join(TEST_DIR, 'test-edit.txt'), 'alpha\nbeta\n');
    await readFileTool.execute({ path: 'tests/temp/test-edit.txt' });

    const result = await editFileTool.execute({
      path: 'tests/temp/test-edit.txt',
      old_text: 'missing',
      new_text: 'delta',
    });

    expect(result).toContain('old_text not found');
  });

  it('rejects ambiguous old_text', async () => {
    await writeFile(join(TEST_DIR, 'test-edit.txt'), 'alpha\nbeta\nbeta\n');
    await readFileTool.execute({ path: 'tests/temp/test-edit.txt' });

    const result = await editFileTool.execute({
      path: 'tests/temp/test-edit.txt',
      old_text: 'beta',
      new_text: 'delta',
    });

    expect(result).toContain('old_text appears multiple times');
  });

  it('rejects edits before the file has been read', async () => {
    await writeFile(join(TEST_DIR, 'test-edit-unread.txt'), 'alpha\nbeta\n');

    const result = await editFileTool.execute({
      path: 'tests/temp/test-edit-unread.txt',
      old_text: 'beta',
      new_text: 'delta',
    });

    expect(result).toBe('Error editing file: tests/temp/test-edit-unread.txt must be read first');
  });

  afterEach(async () => {
    try {
      await unlink(join(TEST_DIR, 'test-edit.txt'));
    } catch {}
    try {
      await unlink(join(TEST_DIR, 'test-edit-unread.txt'));
    } catch {}
  });
});

describe('tool integration: list_dir', () => {
  it('lists files in current directory', async () => {
    const result = await listDirTool.execute({ path: '.' });
    expect(result).toContain('package.json');
    expect(result).toContain('src/');
  });

  it('lists files in nested directory', async () => {
    const result = await listDirTool.execute({ path: 'src' });
    expect(result).toContain('index.ts');
  });

  it('returns error for non-existent directory', async () => {
    const result = await listDirTool.execute({ path: 'nonexistent-dir-xyz' });
    expect(result).toContain('Error');
  });
});

describe('tool integration: grep', () => {
  it.skipIf(process.platform === 'win32')('finds pattern in files', async () => {
    const result = await grepTool.execute({ pattern: 'freecode', path: 'src' });
    expect(result).toContain('src/index.ts');
  });

  it.skipIf(process.platform === 'win32')('returns "No matches found" for non-existent pattern', async () => {
    const result = await grepTool.execute({ pattern: 'xyz-non-existent-pattern-123', path: 'src' });
    expect(result).toBe('No matches found');
  });
});

describe('tool integration: chaining', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true }).catch(() => {});
  });

  it('write then read returns same content', async () => {
    const originalContent = 'chain test content';
    await writeFile(join(TEST_DIR, 'chain-test.txt'), originalContent);
    
    const result = await readFileTool.execute({ path: 'tests/temp/chain-test.txt' });
    expect(result).toBe(originalContent);
  });

  afterEach(async () => {
    try {
      await unlink(join(TEST_DIR, 'chain-test.txt'));
    } catch {}
  });
});
