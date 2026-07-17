import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  computeEditDiffContext,
  editDiffResult,
} from '../../../src/agent/tools/edit-diff-context.js';

describe('editDiffResult', () => {
  it('returns null when args are not a well-formed edit', () => {
    expect(editDiffResult({ path: 'a.ts', old_text: 'x' }, undefined)).toBeNull();
    expect(editDiffResult({ path: 1, old_text: 'x', new_text: 'y' }, undefined)).toBeNull();
  });

  it('builds an edit-diff result, defaulting absent context', () => {
    expect(editDiffResult({ path: 'a.ts', old_text: 'x', new_text: 'y' }, undefined)).toEqual({
      kind: 'edit-diff',
      path: 'a.ts',
      oldText: 'x',
      newText: 'y',
      contextBefore: [],
      contextAfter: [],
      lineIndent: '',
      startLine: 1,
    });
  });

  it('carries provided disk context through', () => {
    const ctx = { contextBefore: ['a'], contextAfter: ['b'], lineIndent: '  ', startLine: 4 };
    expect(editDiffResult({ path: 'a.ts', old_text: 'x', new_text: 'y' }, ctx)).toMatchObject({
      contextBefore: ['a'],
      contextAfter: ['b'],
      lineIndent: '  ',
      startLine: 4,
    });
  });
});

describe('computeEditDiffContext', () => {
  const cwd = process.cwd();
  let dir: string | undefined;

  afterEach(() => {
    process.chdir(cwd);
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  const EMPTY = { contextBefore: [], contextAfter: [], lineIndent: '', startLine: 1 };

  it('degrades to empty context when the file is missing', () => {
    expect(computeEditDiffContext('does-not-exist.txt', 'x')).toEqual(EMPTY);
  });

  it('degrades to empty context for non-string args', () => {
    expect(computeEditDiffContext(3, 'x')).toEqual(EMPTY);
  });

  it('reads the lines surrounding the match with its start line', () => {
    dir = mkdtempSync(join(tmpdir(), 'edit-ctx-'));
    process.chdir(dir);
    writeFileSync('note.txt', 'a\nb\nc\nTARGET\nd\ne\n');

    const ctx = computeEditDiffContext('note.txt', 'TARGET');

    // context abuts the match on both sides
    expect(ctx.contextBefore[ctx.contextBefore.length - 1]).toBe('c');
    expect(ctx.contextAfter[0]).toBe('d');
    // TARGET is file line 4; startLine walks back over the collected before-context
    expect(ctx.startLine).toBe(4 - ctx.contextBefore.length);
  });

  it('stops the context walk at a blank line', () => {
    dir = mkdtempSync(join(tmpdir(), 'edit-ctx-'));
    process.chdir(dir);
    writeFileSync('note.txt', 'far\n\nnear\nTARGET\n');

    const ctx = computeEditDiffContext('note.txt', 'TARGET');

    expect(ctx.contextBefore).toEqual(['near']);
  });
});
