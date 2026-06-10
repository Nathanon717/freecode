import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  setProjectRoot,
  markFileRead,
  hasFileBeenRead,
  resolveProjectPath,
  resolveExistingProjectPath,
  resolveWritableProjectPath,
} from '../../src/agent/context.js';

let tempRoot = '';
const previousCwdRoot = process.cwd();

describe('agent/context path resolution', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'freecode-context-'));
    setProjectRoot(tempRoot);
  });

  afterEach(() => {
    setProjectRoot(previousCwdRoot);
    rmSync(tempRoot, { recursive: true, force: true });
  });

  describe('resolveProjectPath', () => {
    it('resolves a simple relative path under the root', () => {
      const resolved = resolveProjectPath('notes/todo.txt');
      expect(resolved.relativePath).toBe('notes/todo.txt');
      expect(resolved.fullPath).toBe(join(tempRoot, 'notes', 'todo.txt'));
    });

    it('normalises backslashes in the returned relative path to posix', () => {
      const resolved = resolveProjectPath('a/b/c.txt');
      expect(resolved.relativePath).not.toContain('\\');
    });

    it('returns "." for the project root itself', () => {
      expect(resolveProjectPath('.').relativePath).toBe('.');
    });

    it('rejects an empty path', () => {
      expect(() => resolveProjectPath('')).toThrow('Path must not be empty');
      expect(() => resolveProjectPath('   ')).toThrow('Path must not be empty');
    });

    it('rejects an absolute path', () => {
      expect(() => resolveProjectPath(tempRoot)).toThrow('Path must be relative');
    });

    it('rejects a path that escapes the project root', () => {
      expect(() => resolveProjectPath('../outside.txt')).toThrow('escapes project root');
      expect(() => resolveProjectPath('a/../../escape.txt')).toThrow('escapes project root');
    });

    it('allows traversal that stays inside the root', () => {
      const resolved = resolveProjectPath('a/b/../c.txt');
      expect(resolved.relativePath).toBe('a/c.txt');
    });
  });

  describe('resolveExistingProjectPath', () => {
    it('resolves an existing file inside the root', async () => {
      writeFileSync(join(tempRoot, 'real.txt'), 'hi', 'utf-8');
      const resolved = await resolveExistingProjectPath('real.txt');
      expect(resolved.relativePath).toBe('real.txt');
    });

    it('rejects when the file does not exist', async () => {
      await expect(resolveExistingProjectPath('missing.txt')).rejects.toThrow();
    });
  });

  describe('resolveWritableProjectPath', () => {
    it('resolves a writable path when the parent directory exists', async () => {
      mkdirSync(join(tempRoot, 'sub'));
      const resolved = await resolveWritableProjectPath('sub/new.txt');
      expect(resolved.relativePath).toBe('sub/new.txt');
    });

    it('rejects when the parent directory does not exist', async () => {
      await expect(resolveWritableProjectPath('nope/new.txt')).rejects.toThrow();
    });
  });

  describe('read tracking', () => {
    it('reports unread files as not read and tracks reads', () => {
      const p = join(tempRoot, 'tracked.txt');
      expect(hasFileBeenRead(p)).toBe(false);
      markFileRead(p);
      expect(hasFileBeenRead(p)).toBe(true);
    });

    it('clears the read set when the project root changes', () => {
      const p = join(tempRoot, 'tracked.txt');
      markFileRead(p);
      expect(hasFileBeenRead(p)).toBe(true);
      setProjectRoot(tempRoot);
      expect(hasFileBeenRead(p)).toBe(false);
    });
  });
});
