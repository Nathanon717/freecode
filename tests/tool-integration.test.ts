import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, writeFile, rm, mkdir, mkdtemp, symlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFileTool } from '../src/agent/tools/read-file.js';
import { writeFileTool } from '../src/agent/tools/write-file.js';
import { editFileTool } from '../src/agent/tools/edit-file.js';
import { listDirTool } from '../src/agent/tools/list-dir.js';
import { grepTool } from '../src/agent/tools/grep.js';
import { setProjectRoot } from '../src/agent/context.js';

const TEST_DIR = join(process.cwd(), 'tests', 'temp');
const GREP_TEST_FILE = join(process.cwd(), 'tests', 'test-grep-fixture.ts');

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

describe('tool integration: list_dir', () => {
  it('lists files in current directory', async () => {
    const result = await listDirTool.execute({ path: '.' });
    expect(result).toContain('package.json');
    expect(result).toContain('src/');
  });

  it('treats an empty path as the current directory', async () => {
    const result = await listDirTool.execute({ path: '' });
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

  it('rejects paths outside the project root', async () => {
    const result = await listDirTool.execute({ path: '..' });
    expect(result).toContain('Path escapes project root');
  });
});

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

describe('tool integration: chaining', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true }).catch(() => {});
  });

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
