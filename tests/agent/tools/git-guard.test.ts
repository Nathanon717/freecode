import { describe, it, expect } from 'vitest';
import {
  GIT_INTERNALS_REFUSAL,
  isGitInternalPath,
  shellTouchesGitInternals,
} from '../../../src/agent/tools/git-guard.js';

describe('isGitInternalPath', () => {
  it.each([
    ['.git', true],
    ['.git/config', true],
    ['.git/hooks/pre-commit', true],
    ['nested/.git/index', true],
    ['.gitignore', false],
    ['.github/workflows/ci.yml', false],
    ['.gitattributes', false],
    ['src/git/repo.ts', false],
  ])('%s -> %s', (path, blocked) => {
    expect(isGitInternalPath(path)).toBe(blocked);
  });
});

describe('shellTouchesGitInternals', () => {
  it.each([
    'rm -rf .git',
    'rm -rf ./.git',
    'rm -rf "$PWD/.git"',
    'find . -name .git -exec rm -rf {} +',
    'echo broken > .git/HEAD',
    'echo broken >> .git/config',
    'mv .git /tmp/stash',
    'Remove-Item -Recurse -Force .git',
  ])('blocks %s', (command) => {
    expect(shellTouchesGitInternals(command)).toBe(true);
  });

  it.each([
    // Reading git internals is ordinary inspection, not a write.
    'cat .git/HEAD',
    'ls .git',
    // The tool's whole job. `git` is not `.git`.
    'git reset --hard',
    'git clean -fdx',
    // The near-misses the lookahead exists for.
    'rm .gitignore',
    'rm -rf .github',
    'echo dist/ > .gitignore',
    // The exclude idiom: these name `.git` precisely in order to leave it alone,
    // and write somewhere else entirely.
    'grep -r --exclude-dir=.git foo . > out.txt',
    "find . -path ./.git -prune -o -name '*.ts' -print > files.txt",
  ])('allows %s', (command) => {
    expect(shellTouchesGitInternals(command)).toBe(false);
  });
});

describe('GIT_INTERNALS_REFUSAL', () => {
  it('tells the model why, so it stops retrying the same call', () => {
    expect(GIT_INTERNALS_REFUSAL).toContain('.git');
    expect(GIT_INTERNALS_REFUSAL).toContain('history');
  });
});
