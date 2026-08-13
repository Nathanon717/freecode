import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { listExcludedPaths, stagingArgs } from '../../src/snapshots/coverage.js';

let root = '';

afterEach(() => {
  delete process.env['FREECODE_SNAPSHOT_EXCLUDE'];
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
});

function project(...dirs: string[]): string {
  root = mkdtempSync(join(tmpdir(), 'freecode-coverage-'));
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true });
  return root;
}

describe('stagingArgs', () => {
  // `-f` is the whole of finding A2's fix: without it `add` honours the project's
  // .gitignore, and a payload in dist/ is invisible to diff and immune to revert.
  it('forces ignored files in and excludes the default directories at any depth', () => {
    expect(stagingArgs()).toEqual([
      'add',
      '-A',
      '-f',
      '--',
      '.',
      ':(exclude,glob)**/node_modules/**',
      ':(exclude,glob)**/.freecode/**',
    ]);
  });

  it('replaces the default list from the environment, rather than adding to it', () => {
    process.env['FREECODE_SNAPSHOT_EXCLUDE'] = ' cache , dist/ ';

    expect(stagingArgs()).toEqual([
      'add',
      '-A',
      '-f',
      '--',
      '.',
      ':(exclude,glob)**/cache/**',
      ':(exclude,glob)**/dist/**',
    ]);
  });

  it('covers everything when the exclusion list is emptied', () => {
    process.env['FREECODE_SNAPSHOT_EXCLUDE'] = '';

    expect(stagingArgs()).toEqual(['add', '-A', '-f', '--', '.']);
  });
});

describe('listExcludedPaths', () => {
  // What a revert prints in place of the old constant note, which could not tell an
  // absent node_modules from an untouched one full of payloads.
  it('names the excluded directories that exist, pruning at each match', () => {
    const dir = project(
      join('node_modules', 'nested', 'node_modules'),
      join('packages', 'app', 'node_modules'),
      join('packages', 'lib', 'src'),
      '.freecode',
    );

    // Pruned: nothing *inside* an excluded directory is walked or reported, which
    // is the point — walking it would spend the time the exclusion exists to save.
    expect(listExcludedPaths(dir)).toEqual([
      '.freecode/',
      'node_modules/',
      'packages/app/node_modules/',
    ]);
  });

  it('is empty for a project with none of them', () => {
    expect(listExcludedPaths(project('src', 'docs'))).toEqual([]);
  });

  it('says nothing when nothing is excluded', () => {
    process.env['FREECODE_SNAPSHOT_EXCLUDE'] = '';

    expect(listExcludedPaths(project('node_modules'))).toEqual([]);
  });

  it('stops at the limit, so a monorepo cannot flood a revert', () => {
    const dir = project(
      join('a', 'node_modules'),
      join('b', 'node_modules'),
      join('c', 'node_modules'),
    );

    expect(listExcludedPaths(dir, 2)).toHaveLength(2);
  });

  it('skips .git rather than descending into it', () => {
    const dir = project(join('.git', 'node_modules'), 'src');

    expect(listExcludedPaths(dir)).toEqual([]);
  });
});
