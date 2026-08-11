import { describe, it, expect } from 'vitest';
import { semanticDiff } from '../../src/snapshots/semantic-diff.js';

/** One modified-file section of a unified patch. */
function file(path: string, hunks: string[]): string {
  return [`diff --git a/${path} b/${path}`, `index 1111111..2222222 100644`, `--- a/${path}`, `+++ b/${path}`, ...hunks].join('\n');
}

function renameHunk(line: number, from: string, to: string, context = ''): string {
  return [`@@ -${line},3 +${line},3 @@ ${context}`, ` before`, `-  return ${from}(x);`, `+  return ${to}(x);`, ` after`].join('\n');
}

describe('semanticDiff', () => {
  it('collapses an identical substitution across files and names every site', () => {
    const patch = ['a.ts', 'b.ts', 'c.ts']
      .map((path, index) => file(path, [renameHunk(index + 10, 'oldName', 'newName')]))
      .join('\n');

    const out = semanticDiff(patch);

    expect(out).toContain('3x  replace `oldName` -> `newName`');
    // The body is shown once; the locations never collapse, because an edit in
    // an unexpected file is the signal this encoding exists to preserve.
    expect(out).toContain('a.ts:10');
    expect(out).toContain('b.ts:11');
    expect(out).toContain('c.ts:12');
    expect(out).not.toContain('remaining hunks');
  });

  it('shows a repeated insertion once, with its body', () => {
    const insert = ['@@ -1,0 +1,2 @@', `+import { log } from './log.js';`, `+`].join('\n');
    const patch = ['a.ts', 'b.ts'].map((path) => file(path, [insert])).join('\n');

    const out = semanticDiff(patch);

    expect(out).toContain('2x  insert');
    expect(out.match(/import \{ log \}/g)).toHaveLength(1);
    expect(out).toContain('a.ts:1');
    expect(out).toContain('b.ts:1');
  });

  it('prints a hunk raw when its lines do not share one substitution', () => {
    const mixed = [
      '@@ -4,2 +4,2 @@',
      '-  return oldName(x);',
      '-  const total = 1;',
      '+  return newName(x);',
      '+  const total = compute(2, 3);',
    ].join('\n');

    const out = semanticDiff(file('a.ts', [mixed]));

    expect(out).toContain('remaining hunks (1)');
    expect(out).toContain('const total = compute(2, 3);');
    expect(out).not.toContain('repeated edits');
  });

  it('prints a shape seen only once raw rather than as a repetition', () => {
    const out = semanticDiff(file('a.ts', [renameHunk(3, 'oldName', 'newName')]));

    expect(out).not.toContain('repeated edits');
    expect(out).toContain('remaining hunks (1)');
    expect(out).toContain('+  return newName(x);');
  });

  it('places every hunk exactly once — collapsed or raw, never both, never neither', () => {
    const patch = [
      file('a.ts', [renameHunk(10, 'oldName', 'newName'), renameHunk(20, 'oldName', 'newName')]),
      file('b.ts', [renameHunk(30, 'oldName', 'newName')]),
      file('c.ts', [['@@ -1,1 +1,2 @@', '-one', '+two', '+three'].join('\n')]),
    ].join('\n');

    const out = semanticDiff(patch);

    // Four hunks in: three collapse into one shape, the uneven one stays raw.
    expect(out).toContain('3x  replace `oldName` -> `newName`');
    expect(out).toContain('remaining hunks (1)');
    // A replace shape carries its whole meaning in the title — which token
    // became which — so the changed lines are not reprinted at all. Three
    // near-identical bodies would be the cost this encoding exists to avoid.
    expect(out).not.toContain('return newName(x);');
    // The hunk that could not be classified survives verbatim, exactly once.
    expect(out.match(/\+three/g)).toHaveLength(1);
  });

  it('names every substituted token, not just the first', () => {
    const twoSwaps = ['@@ -2,1 +2,1 @@', '-  const a = oldName(first);', '+  const a = newName(second);'].join('\n');

    const out = semanticDiff(file('a.ts', [twoSwaps]));
    const summary = semanticDiff([file('a.ts', [twoSwaps]), file('b.ts', [twoSwaps])].join('\n'));

    expect(out).toContain('remaining hunks (1)');
    expect(summary).toContain('`oldName` -> `newName`');
    expect(summary).toContain('`first` -> `second`');
  });

  it('attributes changes to the symbol in git’s hunk trailer', () => {
    const patch = file('a.ts', [renameHunk(12, 'oldName', 'newName', 'export function runTurn(input) {')]);

    expect(semanticDiff(patch)).toContain('runTurn');
  });

  it('marks created and deleted files', () => {
    const created = [
      'diff --git a/new.ts b/new.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1 @@',
      '+export const x = 1;',
    ].join('\n');
    const deleted = [
      'diff --git a/gone.ts b/gone.ts',
      'deleted file mode 100644',
      '--- a/gone.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-export const y = 2;',
    ].join('\n');

    const out = semanticDiff([created, deleted].join('\n'));

    expect(out).toMatch(/A new\.ts/);
    expect(out).toMatch(/D gone\.ts/);
    expect(out).toContain('2 files changed, +1 -1');
  });

  it('reports nothing for an empty patch', () => {
    expect(semanticDiff('')).toBe('');
  });
});
