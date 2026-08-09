// check-tests: orphan — covers scripts/docgen/, which has no src/ mirror.
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { listSourceFiles, mapPageForSource } from '../../scripts/docgen/map-exports.js';
import { neighborsOf, renderFactsBlock } from '../../scripts/docgen/map-facts.js';
import { countLines, MAX_LINES } from '../../scripts/checks/line-budget.js';

const ROOT = join(import.meta.dirname, '..', '..');

function sourceFor(rel: string): string {
  const file = listSourceFiles().find(path => path.endsWith(join('src', rel)));
  if (!file) throw new Error(`no source file at src/${rel}`);
  return file;
}

// Everything here shares one TypeScript program over the whole of `src/`, and
// building it is the only slow part. Pay it up front rather than inside
// whichever assertion happens to run first — under the full suite's parallel
// load that one was timing out on a budget the other 11 never came near.
beforeAll(() => {
  renderFactsBlock(sourceFor('agent/loop.ts'));
}, 180_000);

describe('countLines — the arithmetic the 500-line gate uses', () => {
  it('does not count the empty string after a trailing newline', () => {
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('')).toBe(0);
  });

  it('does not count the module header, or the blank line under it', () => {
    expect(countLines('/**\n * @role Does the thing.\n */\n\na\nb\n')).toBe(2);
    expect(countLines('/** One-liner. */\na\n')).toBe(1);
  });

  it('counts a block comment that is not the header', () => {
    expect(countLines('a\n\n/**\n * Not the header.\n */\nb\n')).toBe(6);
  });
});

describe('renderFactsBlock', () => {
  it('emits the canonical sections in order, inside one marker pair', () => {
    const block = renderFactsBlock(sourceFor('agent/loop.ts'));
    expect(block.startsWith('<!-- BEGIN GENERATED MAP FACTS -->')).toBe(true);
    expect(block.trimEnd().endsWith('<!-- END GENERATED MAP FACTS -->')).toBe(true);
    const headings = [...block.matchAll(/^## (.+)$/gm)].map(match => match[1]);
    expect(headings).toEqual(['Neighbors', 'Tests', 'Budget', 'Env']);
  });

  it('omits Env for a module that reads no environment', () => {
    expect(renderFactsBlock(sourceFor('cli/theme.ts'))).not.toContain('## Env');
  });

  it('reports env vars read through either access syntax, not ones named in comments', () => {
    const block = renderFactsBlock(sourceFor('agent/loop.ts'));
    expect(block).toContain('`FREECODE_NO_LLM`');
  });

  it('states the budget with the gate\'s own count', () => {
    const file = sourceFor('agent/loop.ts');
    const lines = countLines(readFileSync(file, 'utf-8'));
    expect(renderFactsBlock(file)).toContain(`${lines} / ${MAX_LINES} lines (${MAX_LINES - lines} to spare).`);
  });

  it('names the mirrored test and counts the rest', () => {
    expect(renderFactsBlock(sourceFor('cli/theme.ts'))).toContain('`tests/cli/theme.test.ts`');
  });
});

describe('neighbors', () => {
  it('ranks edges by how often the importing file references what it imported', () => {
    const { imports } = neighborsOf(sourceFor('agent/loop.ts'));
    expect(imports.length).toBeGreaterThan(1);
    for (let i = 1; i < imports.length; i++) {
      expect(imports[i - 1].weight).toBeGreaterThanOrEqual(imports[i].weight);
    }
  });

  it('is symmetric: an edge out of A is an edge into B, with the same weight', () => {
    const loop = sourceFor('agent/loop.ts');
    const systemPrompt = sourceFor('agent/system-prompt.ts');
    const out = neighborsOf(loop).imports.find(edge => edge.file === systemPrompt);
    const back = neighborsOf(systemPrompt).importedBy.find(edge => edge.file === loop);
    expect(out).toBeDefined();
    expect(back?.weight).toBe(out?.weight);
  });

  it('caps each list and says how many it withheld', () => {
    for (const file of listSourceFiles()) {
      const block = renderFactsBlock(file);
      for (const line of block.split('\n').filter(row => row.startsWith('- **'))) {
        const shown = [...line.matchAll(/×\d+/g)].length;
        expect(shown).toBeLessThanOrEqual(12);
        const withheld = /\+(\d+) more$/.exec(line);
        if (withheld) expect(Number(withheld[1])).toBeGreaterThan(0);
      }
    }
  }, 60_000);

  it('links only to map pages that exist — a JSON or package import is not a neighbor', () => {
    for (const file of listSourceFiles()) {
      const page = mapPageForSource(file);
      for (const match of renderFactsBlock(file).matchAll(/]\(([^)]+)\)/g)) {
        expect({ page, target: match[1], exists: existsSync(resolve(dirname(page), match[1])) })
          .toMatchObject({ exists: true });
      }
    }
  }, 60_000);
});

describe('the generated block on disk', () => {
  it('is current for every page, so docs:generate has nothing to rewrite', () => {
    for (const file of listSourceFiles()) {
      const page = readFileSync(mapPageForSource(file), 'utf-8');
      expect(page.includes(renderFactsBlock(file))).toBe(true);
    }
  }, 60_000);

  it('sits directly after the exports block, where canonical order wants it', () => {
    const page = readFileSync(join(ROOT, 'docs/map/agent/loop.md'), 'utf-8');
    expect(page).toContain('<!-- END GENERATED EXPORTS -->\n\n<!-- BEGIN GENERATED MAP FACTS -->');
  });
});
