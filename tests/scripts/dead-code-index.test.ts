// check-tests: orphan — covers scripts/diagnostics/, which has no src/ mirror.
import { describe, it, expect } from 'vitest';
import {
  buildExportRecords,
  collectExports,
  indexReferences,
  type ScannedFile,
} from '../../scripts/diagnostics/dead-code-index.js';

// The reference table is the whole evidence base of the dead-code sweep: every
// verdict the model gives rests on what this index says exists and where. A
// missed export form means a symbol is never audited at all, silently.

describe('collectExports', () => {
  const declarations: Array<[source: string, name: string, kind: string]> = [
    ['export function foo() {}', 'foo', 'function'],
    ['export async function foo() {}', 'foo', 'function'],
    ['export function* foo() {}', 'foo', 'function*'],
    ['export const foo = 1;', 'foo', 'const'],
    ['export let foo = 1;', 'foo', 'let'],
    ['export class Foo {}', 'Foo', 'class'],
    ['export abstract class Foo {}', 'Foo', 'class'],
    ['export interface Foo {}', 'Foo', 'interface'],
    ['export type Foo = string;', 'Foo', 'type'],
    ['export enum Foo {}', 'Foo', 'enum'],
    ['export const enum Foo {}', 'Foo', 'const enum'],
    ['export declare const foo: number;', 'foo', 'const'],
  ];

  it.each(declarations)('reads %s', (source, name, kind) => {
    expect(collectExports(source)).toEqual([{ name, kind, line: 1 }]);
  });

  it('reads an export list', () => {
    expect(collectExports('export { alpha, beta };')).toEqual([
      { name: 'alpha', kind: 'export-list', line: 1 },
      { name: 'beta', kind: 'export-list', line: 1 },
    ]);
  });

  // `a as b` is exported under `b`, and `b` is the only name an importer can
  // write — so `b` is the name whose absence elsewhere means the entry is dead.
  it('takes the alias, not the local name', () => {
    expect(collectExports('export { internal as publicName };')).toEqual([
      { name: 'publicName', kind: 'export-list', line: 1 },
    ]);
  });

  it('reads a type-only export list', () => {
    expect(collectExports('export type { Alpha, Beta };').map(site => site.name)).toEqual(['Alpha', 'Beta']);
  });

  it('strips inline type modifiers inside a list', () => {
    expect(collectExports('export { type Alpha, beta };').map(site => site.name)).toEqual(['Alpha', 'beta']);
  });

  // The closing brace ends the clause, not the newline. Getting this wrong
  // silently drops every name after the first line of a wrapped export.
  it('reads an export list spanning several lines, anchored to its opening line', () => {
    const source = ['const x = 1;', 'export {', '  alpha,', '  beta,', '};'].join('\n');
    expect(collectExports(source)).toEqual([
      { name: 'alpha', kind: 'export-list', line: 2 },
      { name: 'beta', kind: 'export-list', line: 2 },
    ]);
  });

  // A re-export defines nothing locally, so "used only inside this file" can
  // never explain a zero count for it — the barrel entry itself is dead.
  it('marks a re-export distinctly from a local export list', () => {
    expect(collectExports("export { alpha } from './other.js';")).toEqual([
      { name: 'alpha', kind: 're-export', line: 1 },
    ]);
  });

  it('ignores star re-exports and default exports, which carry no name to attribute', () => {
    expect(collectExports("export * from './other.js';\nexport default foo;")).toEqual([]);
  });

  // Anchored at column 0: a top-level export is the only importable kind, and
  // the anchor is what keeps prose inside a comment or template literal out.
  it('ignores an indented or quoted export', () => {
    expect(collectExports('  export const foo = 1;\n// export const bar = 2;')).toEqual([]);
  });

  it('records the declaration line', () => {
    expect(collectExports('\n\nexport const foo = 1;')[0].line).toBe(3);
  });
});

describe('indexReferences', () => {
  const files: ScannedFile[] = [
    { relative: 'src/a.ts', text: 'export const alpha = 1;\nconst y = alpha + alpha;', role: 'code' },
    { relative: 'src/b.ts', text: "import { alpha } from './a.js';", role: 'code' },
    { relative: 'docs/map/a.md', text: 'alpha: number', role: 'docs' },
  ];

  it('finds every occurrence with its file, line and text', () => {
    const index = indexReferences(files, new Set(['alpha']));
    expect(index.get('alpha')).toEqual([
      { file: 'src/a.ts', line: 1, text: 'export const alpha = 1;', role: 'code' },
      { file: 'src/a.ts', line: 2, text: 'const y = alpha + alpha;', role: 'code' },
      { file: 'src/b.ts', line: 1, text: "import { alpha } from './a.js';", role: 'code' },
      { file: 'docs/map/a.md', line: 1, text: 'alpha: number', role: 'docs' },
    ]);
  });

  // A line naming the symbol twice is one piece of evidence, not two.
  it('records a line once however many times it names the symbol', () => {
    const index = indexReferences(files, new Set(['alpha']));
    expect(index.get('alpha')?.filter(hit => hit.line === 2 && hit.file === 'src/a.ts')).toHaveLength(1);
  });

  it('matches whole identifiers only', () => {
    const text = 'const alphabet = 1;\nconst notalpha = 2;';
    expect(indexReferences([{ relative: 'src/c.ts', text, role: 'code' }], new Set(['alpha']))).toEqual(new Map());
  });

  it('ignores names nobody exported', () => {
    expect(indexReferences(files, new Set(['alpha'])).has('y')).toBe(false);
  });
});

describe('buildExportRecords', () => {
  const files: ScannedFile[] = [
    { relative: 'src/a.ts', text: 'export const alpha = 1;\nconst y = alpha;', role: 'code' },
    { relative: 'src/b.ts', text: 'const z = 1;', role: 'code' },
    { relative: 'docs/map/a.md', text: 'alpha: number', role: 'docs' },
  ];
  const index = indexReferences(files, new Set(['alpha']));
  const [record] = buildExportRecords('src/a.ts', collectExports(files[0].text), index);

  it('excludes the declaration itself from internal use', () => {
    expect(record.internal).toEqual([
      { file: 'src/a.ts', line: 2, text: 'const y = alpha;', role: 'code' },
    ]);
  });

  // The load-bearing split. docs/map/** mirrors every source file and names
  // every export, so counting a doc hit as a reference marks the whole codebase
  // live and the precompute finds nothing at all.
  it('keeps documentation mentions out of the reference count', () => {
    expect(record.external).toEqual([]);
    expect(record.docs).toEqual([
      { file: 'docs/map/a.md', line: 1, text: 'alpha: number', role: 'docs' },
    ]);
  });

  it('counts a use from another code file as external', () => {
    const withUse: ScannedFile[] = [...files, { relative: 'src/c.ts', text: 'alpha();', role: 'code' }];
    const [used] = buildExportRecords(
      'src/a.ts',
      collectExports(files[0].text),
      indexReferences(withUse, new Set(['alpha'])),
    );
    expect(used.external).toHaveLength(1);
    expect(used.external[0].file).toBe('src/c.ts');
  });

  it('reports an export nothing mentions at all as empty on every axis', () => {
    const [orphan] = buildExportRecords('src/a.ts', [{ name: 'ghost', kind: 'const', line: 1 }], index);
    expect(orphan).toMatchObject({ internal: [], external: [], docs: [] });
  });
});
