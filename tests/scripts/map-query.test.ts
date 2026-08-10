// check-tests: orphan — covers scripts/docgen/, which has no src/ mirror.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MAP_ROOT,
  MAP_SECTIONS,
  findSection,
  listMapPages,
  matchesGlob,
  normalizeMapPath,
  parseMapPage,
} from '../../scripts/docgen/map-sections.js';

describe('parseMapPage — the two syntaxes', () => {
  it('reads an H2 section from its heading to the next H2', () => {
    const page = parseMapPage('x.md', '# Title\n\n## Read When\n\n- a\n- b\n\n## Notes\n\ntail\n');
    expect(page.title).toBe('Title');
    expect(findSection(page, 'Read When')?.body).toBe('- a\n- b');
    expect(findSection(page, 'Notes')?.body).toBe('tail');
  });

  it('reads an inline bold field as a section', () => {
    const page = parseMapPage('x.md', '# Title\n\n**Role:** Does the thing.\n\n## Notes\n\ntail\n');
    const role = findSection(page, 'Role');
    expect(role?.body).toBe('Does the thing.');
    expect(role?.syntax).toBe('inline');
  });

  it('resolves every spelling in the corpus to one canonical name', () => {
    for (const spelling of ['Key Neighbors', 'Key neighbors', 'Key Neighbours', 'key neighbours']) {
      const page = parseMapPage('x.md', `# T\n\n## ${spelling}\n\n- a\n`);
      expect(page.sections[0].name).toBe('Neighbors');
      expect(page.sections[0].raw).toBe(spelling);
    }
    expect(parseMapPage('x.md', '# T\n\n**Purpose:** p\n').sections[0].name).toBe('Role');
  });

  it('classifies an unreserved heading as tail, keeping its text', () => {
    const page = parseMapPage('x.md', '# T\n\n## How It Works\n\nbody\n');
    expect(page.sections[0]).toMatchObject({ name: 'How It Works', status: 'tail' });
  });

  it('ignores headings inside fenced code', () => {
    const page = parseMapPage('x.md', '# T\n\n## Exports\n\n```md\n## Not A Heading\n```\n\ndone\n');
    expect(page.sections.map(s => s.name)).toEqual(['Exports']);
    expect(findSection(page, 'Exports')?.body).toContain('## Not A Heading');
  });

  it('ends a generated section at its block, so prose below it stays orphan prose', () => {
    const page = parseMapPage(
      'x.md',
      '# T\n\n<!-- BEGIN GENERATED MAP INTENT -->\n## Role\n\nDoes the thing.\n<!-- END GENERATED MAP INTENT -->\n\nStranded prose.\n\n## Notes\n\ntail\n',
    );
    expect(findSection(page, 'Role')?.body).toBe('Does the thing.');
    expect(page.preamble).toBe('Stranded prose.');
  });

  it('drops BEGIN/END GENERATED markers so Exports does not swallow its own', () => {
    const page = parseMapPage(
      'x.md',
      '# T\n\n<!-- BEGIN GENERATED EXPORTS -->\n## Exports\n\nfoo(): void\n<!-- END GENERATED EXPORTS -->\n\n## Notes\n\ntail\n',
    );
    expect(findSection(page, 'Exports')?.body).toBe('foo(): void');
  });

  it('ends an inline field at the blank line and reports the leftover as preamble', () => {
    const page = parseMapPage('x.md', '# T\n\n**Role:** One paragraph.\n\nOrphan prose.\n\n## Notes\n\ntail\n');
    expect(findSection(page, 'Role')?.body).toBe('One paragraph.');
    expect(page.preamble).toBe('Orphan prose.');
  });

  it('leaves an unreserved bold label as prose, not a section boundary', () => {
    const page = parseMapPage('x.md', '# T\n\n## Notes\n\n**Agreement logic:** both sources must agree.\n');
    expect(page.sections.map(s => s.name)).toEqual(['Notes']);
    expect(findSection(page, 'Notes')?.body).toContain('Agreement logic');
  });
});

describe('normalizeMapPath', () => {
  it.each([
    ['src/agent/loop.ts', 'agent/loop.md'],
    ['docs/map/agent/loop.md', 'agent/loop.md'],
    ['agent/loop.md', 'agent/loop.md'],
    ['agent/loop', 'agent/loop.md'],
    ['./src/index.ts', 'index.md'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeMapPath(input)).toBe(expected);
  });
});

describe('matchesGlob', () => {
  it('matches everything with **', () => {
    expect(matchesGlob('**', 'agent/tools/read.md')).toBe(true);
  });

  it('treats a bare directory as a recursive prefix', () => {
    expect(matchesGlob('agent/', 'agent/tools/read.md')).toBe(true);
    expect(matchesGlob('agent', 'agent/loop.md')).toBe(true);
    expect(matchesGlob('agent', 'cli/loop.md')).toBe(false);
  });

  it('stops a single star at the separator', () => {
    expect(matchesGlob('agent/*.md', 'agent/loop.md')).toBe(true);
    expect(matchesGlob('agent/*.md', 'agent/tools/read.md')).toBe(false);
    expect(matchesGlob('agent/**/*.md', 'agent/tools/read.md')).toBe(true);
  });

  it('accepts a docs/map-prefixed pattern', () => {
    expect(matchesGlob('docs/map/util/*.md', 'util/guards.md')).toBe(true);
  });
});

describe('the manifest', () => {
  it('lists each canonical name among its own aliases, normalized', () => {
    for (const section of MAP_SECTIONS) {
      expect(section.aliases).toContain(section.name.toLowerCase());
      expect(section.aliases).toEqual(section.aliases.map(a => a.toLowerCase()));
    }
  });

  it('claims no alias twice', () => {
    const all = MAP_SECTIONS.flatMap(s => s.aliases);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('the corpus parses', () => {
  const pages = listMapPages().map(path => parseMapPage(path, readFileSync(join(MAP_ROOT, path), 'utf-8')));

  it('gives every page a title, a Role and an Exports block', () => {
    const untitled = pages.filter(p => p.title === '').map(p => p.path);
    const roleless = pages.filter(p => !findSection(p, 'Role')?.body).map(p => p.path);
    const exportless = pages.filter(p => !findSection(p, 'Exports')).map(p => p.path);
    expect({ untitled, roleless, exportless }).toEqual({ untitled: [], roleless: [], exportless: [] });
  });

  it('buckets every heading as canonical or tail — the legacy ones are gone', () => {
    const statuses = new Set(pages.flatMap(p => p.sections.map(s => s.status)));
    expect([...statuses].sort()).toEqual(['canonical', 'tail']);
  });

  // The two things the page codemod established that no generator re-derives:
  // `docs:generate` only re-lays the intent block, so a canonical section that
  // drifts below the tail, or prose written outside every heading, would
  // otherwise survive every run.
  it('puts the canonical head above the tail and leaves no prose outside a section', () => {
    const stranded = pages.filter(p => p.preamble).map(p => p.path);
    const misordered = pages
      .filter(p => {
        const firstTail = p.sections.findIndex(s => s.status !== 'canonical');
        return firstTail !== -1 && p.sections.slice(firstTail).some(s => s.status === 'canonical');
      })
      .map(p => p.path);
    expect({ stranded, misordered }).toEqual({ stranded: [], misordered: [] });
  });
});
