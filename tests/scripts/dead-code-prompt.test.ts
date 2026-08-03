// check-tests: orphan — covers scripts/diagnostics/, which has no src/ mirror.
import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, buildUserPrompt, describeExport } from '../../scripts/diagnostics/dead-code-prompt.js';
import type { ExportRecord, Reference } from '../../scripts/diagnostics/dead-code-index.js';

// A sweep's model has no tools: whatever this file omits, the verdict guesses
// at. These assertions are about the three cases that look identical when the
// prompt shows a count instead of the lines behind it.

function reference(file: string, line: number, text: string, role: 'code' | 'docs' = 'code'): Reference {
  return { file, line, text, role };
}

function record(overrides: Partial<ExportRecord> = {}): ExportRecord {
  return {
    name: 'foo',
    kind: 'function',
    line: 10,
    internal: [],
    external: [],
    docs: [],
    ...overrides,
  };
}

describe('describeExport', () => {
  it('names the symbol, its kind and its declaration line', () => {
    expect(describeExport(record())).toContain('`foo` (function, line 10)');
  });

  // Case 1: used only inside its own file. The code stays, the `export` goes —
  // the highest-value finding, and invisible without the same-file lines.
  it('shows same-file uses when nothing external references the symbol', () => {
    const text = describeExport(record({
      internal: [reference('src/a.ts', 40, 'return foo(x);')],
    }));
    expect(text).toContain('0 code references outside this file');
    expect(text).toContain('used inside this file:');
    // The heading already names the file, so the path would be noise.
    expect(text).toContain('line 40: return foo(x);');
    expect(text).not.toContain('src/a.ts:40');
  });

  // Case 2: documented but unused. A doc hit is not a use, and saying so is what
  // stops the map page's generated signature block from marking everything live.
  it('separates documentation mentions from uses', () => {
    const text = describeExport(record({
      docs: [reference('docs/map/a.md', 9, 'foo(): void', 'docs')],
    }));
    expect(text).toContain('0 code references outside this file');
    expect(text).toContain('mentioned in documentation (not a use):');
    expect(text).toContain('docs/map/a.md:9: foo(): void');
  });

  it('says so when a symbol is used nowhere at all, inside or out', () => {
    expect(describeExport(record())).toContain('and never used inside it');
  });

  // Case 3: few references, which is where a count alone is least decisive — a
  // registry entry and a real call site both read as "1".
  it('inlines the lines behind a small reference count', () => {
    const text = describeExport(record({
      external: [reference('src/b.ts', 4, "import { foo } from './a.js';")],
    }));
    expect(text).toContain('1 code reference outside this file');
    expect(text).toContain("src/b.ts:4: import { foo } from './a.js';");
  });

  // Past the threshold the symbol is plainly live and the lines change no
  // verdict, so the prompt keeps the count and drops the evidence.
  it('omits the lines once a symbol is plainly live', () => {
    const external = Array.from({ length: 9 }, (_, i) => reference('src/b.ts', i + 1, `foo(${i});`));
    const text = describeExport(record({ external }));
    expect(text).toBe('- `foo` (function, line 10) — 9 code references outside this file');
  });

  it('caps the evidence it inlines', () => {
    const internal = Array.from({ length: 30 }, (_, i) => reference('src/a.ts', i + 1, `foo(${i});`));
    const lines = describeExport(record({ internal })).split('\n');
    // Header, the "used inside this file:" label, then the capped lines.
    expect(lines).toHaveLength(8);
  });
});

describe('buildUserPrompt', () => {
  const unit = {
    relative: 'src/a.ts',
    code: 'export function foo() {}',
    exports: [record({ internal: [reference('src/a.ts', 2, 'foo();')] })],
  };

  it('inlines the file, since the model has no tools to go read it', () => {
    const prompt = buildUserPrompt(unit);
    expect(prompt).toContain('FILE: src/a.ts');
    expect(prompt).toContain('export function foo() {}');
  });

  it('inlines the reference table', () => {
    expect(buildUserPrompt(unit)).toContain('EXPORT REFERENCE TABLE for src/a.ts');
  });

  it('says so explicitly when a file exports nothing, rather than showing an empty table', () => {
    expect(buildUserPrompt({ ...unit, exports: [] })).toContain('(this file exports nothing)');
  });
});

describe('SYSTEM_PROMPT', () => {
  // Every one of these is a false-positive class seen in the finding taxonomy:
  // omitting the rule turns the sweep into a code review nobody asked for.
  it.each([
    ['the tags it may use', '[unexport]'],
    ['that lint already covers unused locals', 'no-unused-vars'],
    ['that a docs hit is not a use', 'documentation OF the symbol'],
    ['that a tests hit is a use', 'Tested code is live code'],
    ['that signature types read as unreferenced', "exported function's signature"],
    ['that it must not guess across files', 'read another file'],
    ['the required answer format', '`OK` or `DEAD`'],
  ])('states %s', (_name, phrase) => {
    expect(SYSTEM_PROMPT).toContain(phrase);
  });
});
