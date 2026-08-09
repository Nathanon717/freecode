// check-tests: orphan — covers scripts/docgen/, which has no src/ mirror.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readModuleIntent, renderIntentBlock } from '../../scripts/docgen/map-intent.js';

const dir = mkdtempSync(join(tmpdir(), 'map-intent-'));

function withSource(content: string): string {
  const file = join(dir, `${Math.random().toString(36).slice(2)}.ts`);
  writeFileSync(file, content, 'utf-8');
  return file;
}

describe('readModuleIntent', () => {
  it('undoes the gutter, so multi-line text arrives as it was written', () => {
    const intent = readModuleIntent(withSource(
      '/**\n * @role One paragraph.\n *\n * And a second one.\n *\n * @readwhen\n * - a\n * - b\n */\n\nexport const x = 1;\n',
    ));
    expect(intent.role).toBe('One paragraph.\n\nAnd a second one.');
    expect(intent.readWhen).toBe('- a\n- b');
  });

  it('keeps an indented continuation indented', () => {
    const intent = readModuleIntent(withSource('/**\n * @readwhen\n * - a\n *   still a\n */\nexport const x = 1;\n'));
    expect(intent.readWhen).toBe('- a\n  still a');
  });

  it('finds the header under a shebang', () => {
    const intent = readModuleIntent(withSource('#!/usr/bin/env node\n\n/**\n * @role Entry point.\n */\n\nexport const x = 1;\n'));
    expect(intent.role).toBe('Entry point.');
  });

  it('ignores prose above the first tag, and a declaration\'s own doc below', () => {
    const intent = readModuleIntent(withSource('/**\n * Loose prose.\n * @role The role.\n */\n\n/** Not the header. @role wrong */\nexport const x = 1;\n'));
    expect(intent.role).toBe('The role.');
  });

  it('reports nothing for a module with no header at all', () => {
    expect(readModuleIntent(withSource('export const x = 1;\n'))).toEqual({ role: '', readWhen: '' });
  });
});

describe('renderIntentBlock', () => {
  it('emits Role then Read When, inside one marker pair', () => {
    const block = renderIntentBlock(withSource('/**\n * @role R.\n *\n * @readwhen\n * - a\n */\nexport const x = 1;\n'));
    expect(block).toBe(
      '<!-- BEGIN GENERATED MAP INTENT -->\n## Role\n\nR.\n\n## Read When\n\n- a\n<!-- END GENERATED MAP INTENT -->',
    );
  });

  it('omits Read When for a module with no @readwhen', () => {
    expect(renderIntentBlock(withSource('/**\n * @role R.\n */\nexport const x = 1;\n'))).not.toContain('Read When');
  });

  it('still claims its markers when the module has neither tag, so a tag added later needs no codemod', () => {
    expect(renderIntentBlock(withSource('export const x = 1;\n')))
      .toBe('<!-- BEGIN GENERATED MAP INTENT -->\n<!-- END GENERATED MAP INTENT -->');
  });
});
