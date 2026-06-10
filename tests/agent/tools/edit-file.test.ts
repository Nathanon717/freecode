import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { readFileTool } from '../../../src/agent/tools/read-file.js';
import { editFileTool } from '../../../src/agent/tools/edit-file.js';

const TEST_DIR = join(process.cwd(), 'tests', 'temp');

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
    await expect(readFileTool.execute({ path: 'tests/temp/test-edit.txt' })).resolves.toContain('1: alpha\n2: delta\n3: gamma');
  });

  it('preserves CRLF line endings', async () => {
    await writeFile(join(TEST_DIR, 'test-edit.txt'), 'alpha\r\nbeta\r\ngamma\r\n');
    await readFileTool.execute({ path: 'tests/temp/test-edit.txt' });

    const result = await editFileTool.execute({
      path: 'tests/temp/test-edit.txt',
      old_text: 'beta\ngamma',
      new_text: 'delta\nepsilon',
    });

    expect(result).toContain('Edited tests/temp/test-edit.txt');
    await expect(readFile(join(TEST_DIR, 'test-edit.txt'), 'utf-8')).resolves.toBe('alpha\r\ndelta\r\nepsilon\r\n');
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

  it('rejects paths outside the project root before read checks', async () => {
    const result = await editFileTool.execute({
      path: '../outside-freecode.txt',
      old_text: 'alpha',
      new_text: 'delta',
    });

    expect(result).toContain('Path escapes project root');
  });

  afterEach(async () => {
    await rm(join(TEST_DIR, 'test-edit.txt'), { force: true });
    await rm(join(TEST_DIR, 'test-edit-unread.txt'), { force: true });
  });
});
