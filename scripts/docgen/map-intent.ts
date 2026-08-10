/**
 * The authored half of a map page, read out of the source file: `@role` and
 * `@readwhen`.
 *
 * These two sections say what a module is for and when to open it — the only
 * part of a page no parser could derive. They live in the module header comment
 * rather than in the page so that the sentence describing a module is edited in
 * the same diff as the code that invalidates it, which is the largest single
 * cause of map drift.
 *
 * Tags are read off the header text directly, not through the TypeScript
 * checker: `getDocumentationComment` strips tags by design, which is exactly
 * what keeps a header from printing itself inside that page's `Exports` when it
 * attaches to the first export. See `map-exports.ts`.
 */
import { readFileSync } from 'fs';

export const INTENT_BEGIN = '<!-- BEGIN GENERATED MAP INTENT -->';
export const INTENT_END = '<!-- END GENERATED MAP INTENT -->';

/**
 * A block comment opening the file, below a shebang if the file has one.
 * Anything lower down is some declaration's own doc.
 */
const MODULE_HEADER = /^(?:#![^\n]*\n)?\s*\/\*\*([\s\S]*?)\*\//;

/** `@role`, `@readwhen`, or any other tag — always at the start of a line. */
const TAG = /^@([a-z]+)[ \t]*/;

export interface ModuleIntent {
  /** Body of `@role`, verbatim and unwrapped. Empty when the tag is absent. */
  role: string;
  /** Body of `@readwhen`, verbatim. Empty when the tag is absent. */
  readWhen: string;
}

/**
 * Undo the ` * ` gutter, so the text inside a header round-trips to exactly
 * what was written on the page it came from. A blank line in the body is a
 * bare `*`, and an indented continuation keeps its indent.
 */
function headerLines(content: string): string[] | null {
  const header = MODULE_HEADER.exec(content);
  if (!header) return null;
  return header[1]
    .split('\n')
    .map(line => line.replace(/^[ \t]*\*[ \t]?/, ''))
    .map(line => line.trimEnd());
}

/** Split a header into its tags, dropping any untagged prose above the first. */
function tagBodies(lines: string[]): Map<string, string> {
  const bodies = new Map<string, string[]>();
  let current: string[] | null = null;

  for (const line of lines) {
    const tag = TAG.exec(line);
    if (tag) {
      current = [line.slice(tag[0].length)];
      bodies.set(tag[1], current);
    } else if (current) {
      current.push(line);
    }
  }

  return new Map([...bodies].map(([tag, body]) => [tag, body.join('\n').trim()]));
}

/**
 * The file without its header, so a reader judging whether the tags still
 * describe the code is not shown the tags restated inside their own evidence.
 */
export function stripModuleHeader(content: string): string {
  const shebang = /^#![^\n]*\n/.exec(content)?.[0] ?? '';
  return shebang + content.slice(shebang.length).replace(MODULE_HEADER, '').trimStart();
}

export function readModuleIntent(srcAbsPath: string): ModuleIntent {
  const lines = headerLines(readFileSync(srcAbsPath, 'utf-8'));
  const bodies = lines ? tagBodies(lines) : new Map<string, string>();
  return { role: bodies.get('role') ?? '', readWhen: bodies.get('readwhen') ?? '' };
}

/**
 * The generated head of a page, as one replaceable block.
 *
 * A module with neither tag still gets the marker pair, so the block has a home
 * on the page from the first run and a tag added later needs no codemod.
 */
export function renderIntentBlock(srcAbsPath: string): string {
  const { role, readWhen } = readModuleIntent(srcAbsPath);
  const sections: string[] = [];
  if (role) sections.push(`## Role\n\n${role}`);
  if (readWhen) sections.push(`## Read When\n\n${readWhen}`);
  const body = sections.join('\n\n');
  return `${INTENT_BEGIN}\n${body}${body ? '\n' : ''}${INTENT_END}`;
}
